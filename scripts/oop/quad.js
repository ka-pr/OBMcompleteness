/** map quad grid overlay
 * inherits from {@link }
 * <pre>ctor
 * @constructor
 */

function Quad(application)
{
  this._application = application;
  this._map_object = application.map_object();
  this._layer_name = 'Quad grid';
  this._feature_name = 'completeness';
  this._feature_unique_id = 'id';
  this._layer = null;
  this._url = 'localhost';

  this._max_zoom = 17; // 13

  // this.UNKNOWN = 0b000; //0000000000000;
  // this.COMPLETE = 0b001; //0000000000000;
  // this.ALMOST_COMPLETE = 0b010; //0000000000000;
  // this.INCOMPLETE = 0b011; //0000000000000;
  // this.UNDECIDABLE = 0b100; //0000000000000;
  // this.H2O = 0b101; //0000000000000;
  // this.EMPTY = 0b110;

  this.ERROR = {
    '-1': {var:'ERROR_1', name: 'Error (miss)', value:-1, color:'#FF0000', fillColor:'#000000', opacity:.6, fillOpacity:.9}, // missing tile data
    '-2': {var:'ERROR_2', name: 'Error (mult)', value:-2, color:'#FF0000', fillColor:'#FF0000', opacity:.6, fillOpacity:.6} // multiple tiles
  };

  this._rect_options = {color: '#AAAAAA', fillOpacity: .2, weight: 1, onEachFeature: this._on_each_feature.bind(this)};
  this._styling = {
    0b000: {var:'UNKNOWN', name: 'Unknown', value:0b000, color:'#CCCCCC', opacity:.4, fillColor: '#FFFFFF', fillOpacity:.4}, // unknown, grey
    0b001: {var:'COMPLETE', name: 'Complete', value:0b001, color:'#80ff00', opacity:.4, fillColor: '#12a813', fillOpacity:.2}, // complete, green
    0b010: {var:'ALMOST_COMPLETE', name: 'Almost complete', value:0b010, color:'#ff8000', opacity:.6, fillColor: '#ffff00', fillOpacity:.4}, // almost complete, orange
    0b011: {var:'INCOMPLETE', name: 'Incomplete', value:0b011, color:'#ff808c', opacity:.4, fillColor: '#e4808c', fillOpacity:.2}, // incomplete, red
    0b100: {var:'UNDECIDABLE', name: 'Undecidable', value:0b100, color:'#FFFFFF', opacity:.6, fillColor: '#BBBBBB', fillOpacity:.4}, // undecidable, orange
    0b101: {var:'H2O', name: 'Irrelevant (Water)', value:0b101, color:'#aaaaaa', opacity:.0, fillColor: '#6a5acd', fillOpacity:.0}, // H2O, slate blue
    0b110: {var:'EMPTY', name: 'Complete (empty)', value:0b110,  color:'#AAAAAA', opacity:.4, fillColor: '#777777', fillOpacity:.2}, // empty
  };

  this._feature_style_def = {};
  this._completeness_categories = {}; // cmpl category name
  this._completeness_values = {};
  $.each(this._styling, function(k,v) {
    this[v.var] = k;
    this._feature_style_def[k] = v['fillColor'];
    this._completeness_categories[k] = v['name'];
    this._completeness_values[k] = k;
  }.bind(this));

  this._style = new Style(this._rect_options, this._feature_name, this._feature_style_def);

  // this._feature_style_def = {
  // 0b000:'#777777', // unknown, grey
  // 0b001:'#12a813', // complete, green
  // 0b010:'#ffff00', // almost complete,
  // 0b011:'#e4808c', // incomplete, red
  // 0b100:'#ffffff', // undecidable,
  // 0b101:'#6a5acd', // H2O, slate blue
  // 0b110:'#f4863a', // complete (empty)
  // };

  // this._completeness_categories = {
  //   0b000:'Unknown', // unknown, grey
  //   0b001:'Complete', // complete, green
  //   0b010:'Almost complete', // almost complete, turquoise
  //   0b011:'Incomplete', // incomplete, red
  //   0b100:'Undecidable', // undecidable, white
  //   0b101:'Irrelevant (Water)', // H2O, slate blue
  //   0b110:'Complete (empty)', // complete (empty)
  // };
  // this._completeness_values = {
  //   0:this.UNKNOWN, //0000000000000;
  //   1:this.COMPLETE, //0000000000000;
  //   2:this.ALMOST_COMPLETE, //0000000000000;
  //   3:this.INCOMPLETE, //0000000000000;
  //   4:this.UNDECIDABLE, //0000000000000;
  //   5:this.H2O, //0000000000000;
  //   6:this.EMPTY, //
  // };
  this._layers = {};


  /* parent ctor */
  this.Layer_ctr.call(this, this._layer_name, this._url, 'callbacks', this._feature_style_def);

  this._bind_events();
}

/** inherit from @class Layer */
Quad.prototype = Object.create(Layer.prototype);
/** get reference to parent ctors  */
Quad.prototype.Layer_ctr = Layer;



/** Sets the completeness on tiles and in the back in the bin file
    @param ids the ids of the tiles and the address of the bin file to be set to a new completeness
    @param entries the new completeness statusses to be set
*/
Quad.prototype.set_completeness = function(ids, entries)
{
  let data = {};
  ids.forEach((key,i) => data[key] = entries[i]);
  // console.log('ids', ids, 'entries', entries, 'data', data);

  // TODO remove later
  let styling = this._styling;
  for (let idx in data) {
    let completeness = data[idx];
    this._layers[idx].feature.properties.completeness = completeness;
    this._layers[idx].setStyle(styling[completeness]);
  } // /TODO

  console.log('Setting new completeness on', data);

  this._ajax_set_completeness(data);
};



/** @param _bbox optional bbox param */
Quad.prototype.draw_grid =  function(_bbox)
{
  // check whether the grid overlay is active in the overlay control
  if (this._application.overlay_added(this._layer_name)) {
    /* we are active */
    console.log('... draw_grid', this._layer_name, 'layer is active. Using bbox', _bbox);
    if (typeof _bbox === 'undefined') { // from draw_grid()
      this._draw_grid();
    } else if (_bbox === null) { // from draw_grid(null)
      this._draw_grid([0.0,0.0,0.0,0.0]);
    } else {
      this._draw_grid(_bbox);
    }
  } else {
    /* we aren't active */
    console.log('draw grid', this._layer_name, 'layer is inactive.');
    alert('layer inactive commented');
    // but we handle this one case here: an inactive grid when the app is reloaded
    // if (_bbox === null) { // from draw_grid(null)
    //   this._draw_grid([0.0,0.0,0.0,0.0]);
    // } else {
    //   // custom event to react to layer added // replace space
    //   let added_event = 'added_'+(this._layer_name).replace(' ', '_');
    //   // we moved the map in the meantime, so first unbind the old grid add event
    //   $(document).unbind(added_event);
    //   $(document).on(added_event, function(e, bbox) {
    //     // cast bbox form event handler to floats and draw grid
    //     bbox = bbox.map(Number);
    //     console.log('added event received', added_event, bbox);
    //     this._draw_grid(bbox);
    //   }.bind(this));
    // }
  }
};



Quad.prototype._draw_grid = function(_bbox)
{
  if (this._layer) {
    console.log('Squares layer exists');
    this._application.remove_layer(this._layer);
  }
  /* use _bbox if valid or get bbox from current viewport */
  let bbox = this._bbox_from_viewport(_bbox);
  /* get the current zoom */
  let zoom = this._map_object.map().getZoom();
  if (zoom < this._max_zoom) {
    return 0;
  } else {

    return this._ajax_get_completeness(bbox).then(function(response) {
      console.log('... get Ajax response',Object.keys(response).length ,'lines', response);

      let squares = L.geoJSON(response, this._style.layer_style_definition());
      this._squares = squares;

      let _data = new Data();
      let featurename = this._feature_name;
      $.each(this._completeness_categories, function(k,v) {
        let features = {};
        features[featurename] = v;
        let entry = new Entry(features);
        _data.data(featurename, k, entry);
      });
      this._data = _data;
      this._data._feature_keys = [featurename, this._feature_unique_id];
      this._data._polygons = this._squares;
      this._map_object.data_deferred(this._layer_name);
      this._binary_cb(this._squares);

      // return response;
    }.bind(this));
  }
};




/** Returns a bbox list depending on whether @param bbox is a valid bbox */
Quad.prototype._bbox_from_viewport = function(_bbox)
{
  // TODO check for bbox list validity
  let bbox = _bbox; // option to pass in a bbox
  if (typeof _bbox === 'undefined') { // from draw_grid()
    /* the standard behavior is to get the bbox array from the viewport
       Returns a string with bounding box coordinates in a 'southwest_lng,southwest_lat,northeast_lng,northeast_lat' format */
    bbox = this._map_object.map().getBounds().toBBoxString().split(',').map(Number);
  }
  console.log('... preset Bbox of', _bbox, 'translates to Bbox', bbox);
  return bbox;
};



Quad.prototype._bind_events = function()
{
  this._application.map_object()._map
    .on('zoomend moveend', function(e){
      console.log('... zoomend moveend event', e);
      if (this._dropdown) {
        // remove the batch edit dropdown if it exists
        this._map_object._map.removeControl(this._dropdown);
      }

      this.draw_grid();
      this._legend_highlight();
    }.bind(this))
    .on('boxzoomend', function(e) {
      // console.log('boxzoomend', e);
      let bbox = L.rectangle(e['bbox']);
      let selected = this._ids_by_bbox(bbox);
      this._drop_down_menu(selected);
    }.bind(this));
};



Quad.prototype._ajax_get_completeness = function(bbox)
{
  /* define an action type so we can distinguish between set and get */
  let _d = {'action': 'quad_get',
            'bbox': bbox};

  let data = JSON.stringify(_d);
  // console.log('Get completeness: JSON data string', data);

  return $.ajax({
    url: '/wsgi/grid.wsgi',
    method: 'POST',
    data: data,
    dataType: 'json',
    processData: 'false',
    // responseType: 'arraybuffer',
    success: function(response) {
      // console.log('grid.wsgi post response', response);
      return response;
    },
    error: function (xhr, ajaxOptions, thrownError) {
      console.error('error fetching data', thrownError, xhr.status, xhr.responseText, xhr );
    }
  });
};




Quad.prototype._ajax_set_completeness = function(_data)
{
  /* define an action type so we can distinguish between set and get */
  let _d = {'action': 'quad_set',
            'data': _data};
  let data = JSON.stringify(_d);
  console.log('Set new completeness: JSON data string', data);

  let layers = this._layers;
  let categories = this._completeness_categories;
  let styling = this._styling;
  let set_curr_hl = this._set_currently_highlighted.bind(this);
  let grid = this;
  $.ajax({
    url: '/wsgi/grid.wsgi',
    method: 'POST',
    data: data,
    dataType: 'json',
    processData: 'false',
    // responseType: 'arraybuffer',
    success: function(response) {
      console.log('grid.wsgi post response', response);
      for (let idx in response){
        let completeness = response[idx];
        layers[idx].feature.properties.completeness = completeness;
        layers[idx].setStyle(styling[completeness]);
        if (this.SHOW_POPUP){
          layers[idx]._popup.setContent(categories[completeness]);
          layers[idx].openPopup();
        }
        grid._legend_highlight(); // reset current legend highlight
        grid._legend_highlight(completeness); // set new legend highlight
      }
      let keys = Object.keys(response);
      if (keys.length == 1) {
        let id = keys[0];
        let new_cmpl = response[id];
        // update the currently highlighted cells id and cmpl, so we don't set the same cmpl over and over again
        set_curr_hl(id, new_cmpl);
      }
    },
    error: function (xhr, ajaxOptions, thrownError) {
      console.error('error fetching data', thrownError, xhr.status, xhr.responseText, xhr );
    }
  });
};




Quad.prototype._binary_cb = function(layer)
{
  if (this._layer) {
    // console.log('Callback: Squares layer exists');
    this._application.remove_layer(this._layer);
  }

  /* only true on first load / init */
  if (this._layer == null) {
    /* this is only true the first time the app is loaded */
    this._layer = layer;
    /* invoke funtion to add this layer to the map and to the layer control */
    this._map_object._json_callback_fn(this);
    /* add legend to the bottom right corner */
    this._application.overlay_style(this._layer_name, this._feature_name, null, ['completeness']);
  } else {
    this._layer = layer;
    this._application.add_layer(layer, this._layer_name);
  }
  // let overlays = [[this._layer_name, layer]];
  // this._application._overlays = overlays;
};




Quad.prototype._on_each_feature = function(feature, layer)
{
  let completeness = feature.properties.completeness;
  let color = this._feature_style_def[completeness];
  let id = feature.properties.id;

  layer.on({
    mouseover: this._feature_highlight.bind(layer, feature, this),
    mouseout: this._feature_reset_highlight.bind(null, this),
    click: this._feature_on_click.bind(this),
  });
  if (this._styling.hasOwnProperty(completeness)) {
    layer.options.fillColor = this._feature_style_def[completeness];
    layer.options.color = this._styling[completeness]['color'];
    layer.options.opacity = this._styling[completeness]['opacity'];
    layer.options.fillOpacity = this._styling[completeness]['fillOpacity'];
  } else {
    let ERROR = this.ERROR[completeness];
    // console.log('... Error', id, 'with completeness', completeness, 'Error style', ERROR);
    layer.options.fillColor = ERROR.fillColor;
    layer.options.color = ERROR.color;
    layer.options.opacity = ERROR.opacity;
    layer.options.fillOpacity = ERROR.fillOpacity;
  }
  this._layers[id] = layer;
};

/** sets layer highlight style definition to a highlighted appearance
 * @property styledef
 * @property categories
 * @property set_curr_hl
 * @private
 */
Quad.prototype._feature_highlight = function(feature, grid)
{
  let styledef = grid._feature_style_def;
  let categories = grid._completeness_categories;
  let set_curr_hl = grid._set_currently_highlighted.bind(grid);
  let completeness = feature.properties.completeness;
  let id = feature.properties.id;
  let color = styledef[completeness];
  // console.log('Highlight feature', completeness, this._popup);

  // draw a colored border around the respective completeness' legend entry
  grid._legend_highlight(completeness, id);

  set_curr_hl(id, completeness);

  /* TODO - still hardwired */
  this.setStyle({
    // weight: weight,
    // color: '#226',
    color: color,
    dashArray: '',
    opacity: .95,
    fillOpacity: .0
  });
};


/** Stores the id and completeness value of the most recent highlighted cell in the map object */
Quad.prototype._set_currently_highlighted = function(id, completeness)
{
  // console.log(this);
  this._map_object._currently_highlighted_id = id;
  this._map_object._currently_highlighted_cmpl = completeness;
};


/** resets a layer's feature styling
 * @private
 * @param {Layer} c a layer object, the Leaflet layer that received a callback (mouseover, mouseout, ...)
 * @param {Object} e an Event object that e.g. contains the feature it has been fired on
 */
Quad.prototype._feature_reset_highlight = function(grid, e)
{
  let set_curr_hl = grid._set_currently_highlighted.bind(grid);

  // console.log(e.target.feature, c._style_default(e.target.feature));
  e.target.setStyle(grid._style_default(e.target.feature));

  grid._legend_highlight();

  set_curr_hl(null, null);
};

Quad.prototype._legend_highlight = function(completeness, id)
{
  let zoom = this._map_object.map().getZoom();
  if (typeof completeness === 'undefined') {
    // reset
    $('.'+this._application.ID_PREFIX+'_infolegend_entry').parent().css({"border-color":'#00000000', "border-style": 'solid'});
    $('#'+this._application.ID_PREFIX+'_infolegend_heading').html(zoom);
  } else {
    // highlight appropriately
    let color = this.ERROR[-1].color;
    if (this._styling.hasOwnProperty(completeness)) {
      color = this._styling[completeness]['color'];
    }
    $('.'+this._application.ID_PREFIX+'_infolegend_entry[data-value="'+completeness+'"]').parent().css({"border-color":color, "border-style": 'solid'});
    /* set the currently highlighted id in the legend */
    $('#'+this._application.ID_PREFIX+'_infolegend_heading').html(id);
  }
};

/** returns a default style for the vector layer
 * @private
 * @description {color:aColor,dashArray:aNumber,fillColor:aColor,fillOpacity:aNumber[0..1],opacity:aNumber[0..1],weight:aNumber}
 * @param {Object} feature a Leaflet vector layer feature object
 * @returns {Object} a default style for the vector layer
 */
Quad.prototype._style_default = function(feature)
{
  /* pre-set a styling value for the fill color based on the passed in feature parameter */
  let ret = { fillColor: this._feature_color(feature.properties[ this._style.feature_property_name() ]) };
  /* get reference to feature styling object */
  let styledef = this._style.layer_style_definition();
  Object.keys(this._style.layer_style_definition()).forEach(function (key) {
    // console.log(key);
    ret[key] = styledef[key];
  });
  let completeness = feature.properties.completeness;
  if (this._styling.hasOwnProperty(completeness)) {
    ret['color'] = this._styling[completeness]['color'];
    ret['fillColor'] = this._styling[completeness]['fillColor'];
    ret['opacity'] = this._styling[completeness]['opacity'];
    ret['fillOpacity'] = this._styling[completeness]['fillOpacity'];
  } else {
    let ERROR = this.ERROR[completeness];
    ret['color'] = ERROR.color;
    ret['fillColor'] = ERROR.fillColor;
    ret['opacity'] = ERROR.opacity;
    ret['fillOpacity'] = ERROR.fillOpacity;
  }
  return ret;
};

/** feature styling color fetch fn
 * @private
 * @param {String} feature_property a feature property by which the styling of the layer's features is determined
 * @returns {String} a color String
 */
Quad.prototype._feature_color = function(feature_property)
{
  /* set a default feature styling value */
  let ERROR = this.ERROR[feature_property];
  let ret = this.ERROR.color;
  /* get reference to feature styling object */
  let styledef = this._style.feature_style_definition();
  /* return feature style based on feature property @param feature_property */

  if (styledef.hasOwnProperty(feature_property)) {
    ret = styledef[feature_property];
  }
  // Object.keys(styledef).forEach(function (key) {
  //   if (key == feature_property) {ret = styledef[key];}
  // });
  return ret;
};






/** passes an event {Object} to the callback function of this layerstyle's style object
 * @private
 * @param {Object} e an event object
 * @throws {} TODO exception handling
 */
Quad.prototype._feature_on_click = function(e)
{
  let completeness = e.target.feature.properties.completeness;
  // TODO check against real completeness from the binary file

  let id = e.target.feature.properties.id;
  let ids = [id];
  console.log('Click at', ids, 'completeness', completeness);

  // let entry = 0b0001000000000000;
  // FIXME UGLY :(((
  let entry = this.UNKNOWN;
  if (completeness == this.UNKNOWN) { // 0
    entry = this.COMPLETE;
  } else if (completeness == this.COMPLETE) {
    entry = this.ALMOST_COMPLETE;
  } else if (completeness == this.ALMOST_COMPLETE) {
    entry = this.INCOMPLETE;
  } else if (completeness == this.INCOMPLETE) {
    entry = this.UNDECIDABLE;
  } else if (completeness == this.UNDECIDABLE) {
    entry = this.H2O;
  } else if (completeness == this.H2O) {
    entry = this.EMPTY;
  } else if (completeness == this.EMPTY) {
    entry = this.COMPLETE;
  } else { // errors
    entry = this.UNKNOWN;
  }
  let entries = [entry];

  // change completeness on the map tile
  // TODO maybe put that in the set_completeness fn
  e.target.feature.properties.completeness = entry; //completeness==1?0:1;

  /* Set the completeness status on tiles */
  this.set_completeness(ids, entries);
};
