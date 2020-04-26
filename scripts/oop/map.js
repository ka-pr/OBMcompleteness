/** base Map class
 * initializes a new Map object
 * this class takes care of all Leaflet Map related functionality
 * @constructor
 * @property {Object} _globals global values related to the leaflet map
 * @property {Object} _layers object to store base and overlay layer arrays
 * @property {Object} _ids object to store map and sidebar HTML ids
 * @property {String} map_id the id of the leaflet map container w/o project specific prefix
 * @property {String} sidebar_id the id of the map attached sidebar element
 * @property {String} id_prefix a project specific prefix for id elements
 */
function L_Map( application, cb_map_ready )
{
  this._application = application;
  let map_id = application.MAP_ID;
  let sidebar_id = application.SIDEBAR_ID;
  let id_prefix = application.ID_PREFIX;
  this._cb_map_ready = cb_map_ready || function(){console.warn('no map ready callback specified');};
  this._globals = { map: { MIN_ZOOM_WORLD:1, MAX_ZOOM_WORLD:19 } };
  this._layers = { base: [], overlay: [] };
  this._ids4js = {};
  /** @global */
  this._mapready_def = $.Deferred();
  /** @global */
  this._layer_defs = {};
  /** @global */
  this._data_defs = {};
  /** @global */
  this._currently_highlighted_id = null;
  this._currently_highlighted_cmpl = null;

  this._add_id4js('prefix', id_prefix);
  var ids = new Ids( this._create_id(id_prefix, sidebar_id), this._create_id(id_prefix, map_id) );
  $.each(this._ids4js, function(k,v) {
    //console.log('adding',k, ' => ', v, 'to window.ids', window.ids);
    ids[k] = v;
  });

  /* store sidebar and map ids here
   * ids is an object of @class Ids
   */
  this._ids = ids.get(); //{ map: 'map', sidebar: 'sidebar' };
}

/** *** initializes a new Leaflet map object and layer control object ***
 * adds the sidebar to the Leaflet map
 * sidebar and map HTML ids are fetched from a window.ids object which is created by sidebar.php class ...
 * ... the L_Map class constructer fetches this object and assigns it to this._ids property
 * @param {Object} [params] a Leaflet parameter object, e.g. { center: [51.3, 13.37], zoom: 6}
 * @param {String} [suffix=""] TODO - not used
 */
L_Map.prototype.init = function(params, suffix="")
{
  if (typeof params === 'undefined') { params = { center: [51.3, 13.37], zoom: 4 }; }
  this.base_maps = {};
  for (i = 0; i<this._layers.base.length; ++i) {
    this.base_maps[this._layers.base[i].description()] = this._layers.base[i].layer();
  }

  /* private property
   * init map object with first layer selected
   */
  L.Map.BoxSelector = L.Map.BoxZoom.extend({

    _onMouseUp: function(e) {

      if ((e.which !== 1) && (e.button !== 1)) { return; }

	  this._finish();

	  if (!this._moved) { return; }
	  // Postpone to next JS tick so internal click event handling
	  // still see it as "moved".
      setTimeout(L.bind(this._resetState, this), 0);

      let nw = this._map.containerPointToLatLng(this._startPoint);
      let se = this._map.containerPointToLatLng(this._point);
      let bounds = new L.LatLngBounds(nw,se);

      // console.log('box selector', bounds);
      this._map
      // .fitBounds(bounds)
        .fire('boxzoomend', {bbox: bounds});
    }
  });
  L.Map.mergeOptions({boxSelector: true});
  L.Map.addInitHook('addHandler', 'boxSelector', L.Map.BoxSelector);
  L.Map.mergeOptions({boxZoom: false});

  // if baselayer data structure is empty provide empty list
  let layers = this._layers.base.length > 0? [this._layers.base[0].layer()]: [];
  this._map = L.map(this._ids.map + suffix, {
    center: params.center,
    zoom: params.zoom,
    layers: layers
  });

  /* hook into event to call back when the map is done loading */
  this._map.on('load', function() {
    this._mapready_def.resolve('map ready');
    // set the focus to the map so key pressed completeness changes works right away
    this._map.getContainer().focus();
  }.bind(this));

  this._map.on('keypress', function(e) {
    this._map_on_keypress(e);
  }.bind(this));

  /* private property
   * create the layers control
   */
  this._layerControl = new L.control.layers(this.base_maps, null, { collapsed: true }).addTo(this._map);

  /* TODO - handle JsonLayer geojson not yet finished fetching when this function executes */
  for (i = 0; i<this._layers.overlay.length; ++i) {
    if (! (this._layers.overlay[i].added() || typeof this._layers.overlay[i].layer() === 'undefined') ) {
      this._map_add_layer(this._layers.overlay[i]);
    }
  }

  /* add the sidebar to the map html container */
  this.sidebar();
  /* add coordinate plugin to map */
  this.coordinates();

  this._map.doubleClickZoom.disable();

  // TODO very hacky
  this._map.keyboard.disable();
  // TODO better go with sth along those lines:
  // document.getElementById("mapid").onkeydown = function (e) {
  //       if(e.keyCode == '54') {    // 6
  //            e.stopPropagation();
  //       }
  //   };
};

/** *** ***
 * @returns this Leaflet map object
 */
L_Map.prototype.map = function()
{
  return this._map;
};

/** *** ***
 * @returns this Leaflet ids object
 */
L_Map.prototype.ids = function()
{
  return this._ids;
};

/** *** ***
 * @returns this Leaflet layercontrol object
 */
L_Map.prototype.layercontrol = function()
{
  return this._layerControl;
};


/** *** pushes a new @class BaseLayer object to the data structure ***
 * @param description the description of the layer as it is displayed in the map control widget
 * @param url the URL string of this layer
 * @param attribution the attribution string, e.g. layer reference
 */
L_Map.prototype.add_base_layer = function(description, url, attribution)
{
  this._layers.base.push( new BaseLayer(description, url, attribution) );
};

/** *** adds a new vector layer from a json file to the map ***
 * @param description the description of the layer as it is displayed in the map control widget
 * @param url the URL where json file is to be found
 * @param [params] a style parameter object
 */
L_Map.prototype.add_json_layer = function(description, url, params, ignore_keys)
{
  var l = new JsonLayer(description, url, this._json_callback_fn.bind(this), params, ignore_keys );
  // this._layers.overlay.push(l);
  /* report adding this layer back to the application after the map has been loaded */
  // console.log('params', params, 'new json layer', l);
  return l;
};

/** *** adds a new vector layer from an ESRI shapefile file to the map ***
 * @param description the description of the layer as it is displayed in the map control widget
 * @param url the URL where the zipped shapefile file is to be found
 * @param [params] a style parameter object
 */

L_Map.prototype.add_shpzip_layer = function(description, url, params)
{
  var l = new ShpJsonLayer(description, url, this._json_callback_fn.bind(this), params );
  // this._layers.overlay.push(l);
  /* report adding this layer back to the application */
  // jQuery.event.trigger('layer_added_ready', [description, l]);
  //console.log('params', params, 'new shp layer', l);
  return l;
};


/** *** removes an overlay from overlay array ***
 * @param description the layer's description
 * @return true or false based on success
 */
L_Map.prototype.remove_layer = function(description)
{
  if (! description) {
    return false;
  } else {
    $.each(this._layers.overlay, function(_, overlay) {
      if (overlay._description == description) {
        console.log('... removing layer', overlay);
        /* remove the overlay's laye from the map */
        this._map.removeLayer(overlay.layer());
        /* remove the overlay layer's entry from the layer control */
        this._layerControl.removeLayer(overlay.layer());
        /* remove the overlay from the data structure that stores all present overlays */
        this._layers.overlay.splice( $.inArray(overlay, this._layers.overlay), 1 );

        // this.overlay_deferred(description);
        return true;
      } else {
        return false;
      }
    }.bind(this));
  }
  return true;
};

/** *** returns the map object's overlay array ***
 * @return this map object's array of added vector overlays
 */
L_Map.prototype.overlays = function(description = null)
{
  if (! description) {
    return this._layers.overlay;
  } else {
    var ret;
    $.each(this._layers.overlay, function(_, overlay) {
      if (overlay._description == description) {
        ret = overlay;
        // console.log('... returning overlay', description, ret, 'of:', this._layers.overlay);
        return false; // break
      }
      return false;
    }.bind(this));
    return ret;
  }
};

L_Map.prototype.overlay_deferred = function(layer_description)
{
  if (!this._layer_defs[layer_description]) {
    this._layer_defs[layer_description] = new $.Deferred();
  }
  return this._layer_defs[layer_description];
};

L_Map.prototype.data_deferred = function(layer_description)
{
  if (!this._data_defs[layer_description]) {
    this._data_defs[layer_description] = new $.Deferred();
  }
  return this._data_defs[layer_description];
};

/** *** adds the sidebar to the map ***
 * requires the @https://github.com/Turbo87/sidebar-v2 Leaflet sidebar plugin
 * @param id the HTML id of the sidebar
 */
L_Map.prototype.sidebar = function()
{
  this.sidebar = L.control.sidebar(this._ids.sidebar);
  /* make sure the sidebar isn't covered by other html objects */
  $('#'+this._ids.sidebar).css( "zIndex", 1001 );
  $('.sidebar-content').css( "zIndex", 1001 );
  //this.sidebar.on('show', onSidebarShow);
  this.sidebar.addTo(this._map);
};

L_Map.prototype.coordinates = function()
{
  let coordinate_plugin = L.control.coordinates({
    position: "bottomleft", //optional default "bootomright"
    decimals: 4, //optional default 4
    decimalSeperator: ".", //optional default "."
    labelTemplateLat: "Lat: {y}", //optional default "Lat: {y}"
    labelTemplateLng: "Lon: {x}", //optional default "Lng: {x}"
    enableUserInput: true, //optional default true
    useDMS: false, //optional default false
    useLatLngOrder: false, //ordering of labels, default false-> lng-lat
    markerType: L.marker, //optional default L.marker
    markerProps: {title: '', alt: '', clickable: true, draggable:true, riseOnHover:true} //optional default {},
  });
  coordinate_plugin.addTo(this._map);
};

/** *** private ***
 * callback fn that gets called from an object of @class JsonLayer or one of it's child classes ...
 * ... once that object is done fetching the geojson layer object that it wraps
 * the response wrapped geojson object is added to the leaflet map from here
 * @param response a @class JsonLayer object
 */
L_Map.prototype._json_callback_fn = function(response)
{
  this._map_add_layer(response);
  console.log('... json callback received', Object.values(response));
  if (this._data_defs[response.description()]){
    // console.log('response', response);
    this._data_defs[response.description()].resolve('done fetching data '+response.description(), response._data);
  } else {
    console.log('No data deferred');
  }
  /* call back to the application object */
  this._cb_map_ready();

  $.when( this._mapready_def ).done( function(msg) {
    jQuery.event.trigger('layer_added_ready', [response._description, response._layer]);
    $(document).off('layer_added_ready');
    // console.log('... map ready', msg);
  });
};

L_Map.prototype._map_on_keypress = function(e)
{
  let id = this._currently_highlighted_id;
  let cmpl = this._currently_highlighted_cmpl;
  let key = e.originalEvent.key;
  // completeness categories
  let cats = this._application._map_object._quad._completeness_categories;
  // completeness values
  let values = this._application._map_object._quad._completeness_values;
  console.log('... Clicked', key, 'categories', cats, 'values', values);
  if (typeof cats[key] !== 'undefined') {
    // check if the pressed key is a valid number for a completeness status
    // if we try to change to the present completeness, skip
    if (key == cmpl) {return;}
    // if we are not highlighting a cell, skip
    if (id === null || cmpl === null) {return;}

    let cat = cats[key]; // cmpl category
    console.log('... Clicked', id, 'old cmpl', cmpl, '==> key', key);
    /* Set the completeness statusses as array on cells with id as array */
    this._application._map_object._quad.set_completeness([id], [values[key]]);
  }
};

/** *** private ***
 * adds a layer to the map and to the layer control
 * @param layerobj an object of @class JsonLayer or one of it's child classes
 * property layer the layer to add to the map and the layer control
 * property description the layer's description in the layer control
 */
L_Map.prototype._map_add_layer = function(layerobj)
{
  /* test if this layer already has been added */
  if (!layerobj.added()) {
    /* if the leaflet map hasn't been created we cannot add stuff to it */
    if (typeof this._map === 'undefined') {
      // TODO - error handling
    } else {
      /* mark this layer as added */
      layerobj.added(true);
      // console.log('... features', layerobj.features());
      if (!this._layer_defs[layerobj.description()]) {
        this._layer_defs[layerobj.description()] = new $.Deferred();
      }

      /* add the layer to map */
      this._application.add_layer(layerobj.layer(), layerobj._layer_name);
      // layerobj.layer().addTo(this._map);
      /* add the layer to the storing data structure */
      this._layers.overlay.push(layerobj);
      /* add a layer control element to the map */
      // this._layerControl.addOverlay(layerobj.layer(), layerobj.description());
      /* we are done with the layer - callback to the application object */
      console.log('... callback (@fn:_map_add_layer): finished adding layer to the map, calling back to application object', layerobj);
      this._layer_defs[layerobj.description()].resolve('added layer '+layerobj.description());
    }
  }
};




L_Map.prototype._add_id4js = function(key, value)
{
  this._ids4js[key] = value;
};

L_Map.prototype._create_id = function(id_prefix, id_postfix)
{
  return (id_prefix.length === 0)? id_postfix : id_prefix + '_' + id_postfix;
};


/** ----------------------------------------------------- **/


/** creates an id object
 * @constructor
 * @todo do we need this
 * @param {String} s the sidebar html id string
 * @param {String} m the map html id string
 */
function Ids(s,m){this._i={map:m,sidebar:s};}
Ids.prototype.get=function(){return this._i;};
