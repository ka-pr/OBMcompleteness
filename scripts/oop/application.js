/** site application
 * inherits from {@link }
 * <pre>ctor
 * @constructor
 * @param {String}
 * @param {String}
 * @param {Function}
 * @param {Style}
 */
function Application(base_layers, overlays)
{
  this._base_layers = base_layers, this._overlays = overlays;
  this._init_variables();
  this._map_object = new L_Map( this, this.cb_map_ready.bind(this) );
  /* call parent ctr to store passed in params */
  // ...

  // this.overlay_style(feature, feature_style_def);
  // console.log('... style object', this._style_object);
  // this._infoview_create();

  /* adds behavior to the site that transfers the map into a modal when scrolling down */
  // this._map_modal_init();
  $("#data").css({'visibility': 'hidden', 'height': '0px', 'min-height':'0px'});
  $("#gfz_obm_tabpanes").css({'visibility': 'hidden', 'height': '0px', 'min-height':'0px'});
  $('body').css({'overflow':'hidden'});

  /** zip filereader */
  this.zipfilereader.init(this._map_object);
  // this.json_fetched_cb(this);

  /* rest */
  this._behavior_and_events_init();
}

Application.prototype.map_object = function()
{
  return this._map_object;
};

/** inits the map
 * <pre>behavior
 * - {@link cb_data_ready} callback fn that is to invoked when a {@link Data} object is ready
 *
 * <pre>design
 * - map view: a big map filling the whole visible pane
 * - data view: a view below the big map dedicated to data display (and manipulation)
 * - nav bar: a top bar that provides navigational shortcuts to directly jump to different views
 * - table: table display of data. data is stored in an object of @class {data}
 * - info view: a short table to display the current selected map feature
 * - legend: color encoded data legend
 * - modal map: if scrolled down, the map objects transfers from the big view into a smaller modal (and vice versa
 * - sidenbar: a sidebar object within the big map to provide control and setting options
 *
 * <pre>*********************************************************
 *  /------------------------------------------------------\
 *  |_______________________nav bar________________________|
 *  |S  |                                                  |
 *  |i  |                   big MAP                        |
 *  |d  |                                                  |
 *  |e  -----------                          --------------|    map view
 *  |b  |info view |                         |   legend    |
 *  |a  |          |                         |             |
 *  |r  |          |                         |             |
 *  \------------------------------------------------------/
 *  /      table       |                                   \
 *  |  -               |                   --------------- |
 *  |  -               |                   |   modal map | |
 *  |  -               |                   |             | |    data view
 *  |  -               |                   |             | |
 *  |  -               |                   --------------- |
 *  \------------------------------------------------------/
 * *********************************************************
 *
 * @param {String} [suffix=""] we add a suffix to map's html id, thus we can differentiate between big and modal map
 * as well as apply unique css rules. default value for modal should be suffix='_modal' */
Application.prototype.map_init = function(suffix = "")
{
  /* when switching between big and modal map display, we need to remove the current map object */
  if (typeof this._map_object !== 'undefined' && this._map_object.map()) {
    /* remove current map if exists */
    this._map_object.map().off();
    this._map_object.map().remove();
    // FIXME do we need to create a new map object here? we already did so in the ctor
    this._map_object = new L_Map( this, this.cb_map_ready.bind(this) );
  }
  /** set up a new leaflet map wrapper object and add base layers to it */
  if (!this._style_object) {
    this._style_object = new Style();
  }

  $.each(this._base_layers, function(_, base_layer){
    this._map_object.add_base_layer(base_layer[0], base_layer[1], base_layer[2]);
  }.bind(this));

  $.each(this._overlays, function(_, overlay) {
    // this._map_object.data_deferred(overlay[0]);
    /* add json layer (description, url, params) */
    this._map_object.add_json_layer(overlay[0], overlay[1], this._style_object, this._ignore_keys);
  }.bind(this));

  /** invoke init to set up the leaflet map and add it to the site */
  var bb = $.cookie('map_boundingbox')? $.cookie('map_boundingbox').split(','): [-13.37, 33.37, 36.66, 64.42],
      sw = L.latLng( parseFloat(bb[1]), parseFloat(bb[0]) ),
      ne = L.latLng( parseFloat(bb[3]), parseFloat(bb[2]) ),
      bounds = new L.LatLngBounds( sw, ne ),
      zoom = $.cookie('map_zoom')? $.cookie('map_zoom'): 4;
  console.log('Map init with bounds', bb, 'Zoom', zoom);
  /* add the map to the standard big view html anchor when there's no suffix,
   * else add it to the modal anchor if the suffix says so,
   * else throw an error */
  if (suffix === "") {
    this._map_object.init( { /*center: [58.3, 13.37], zoom: 4*/}, suffix );
    /* only add legend and info view in large display */
    this._legend_object = new Legend(this._style_object, this.ID_PREFIX);
    this._legend_object.legend().addTo(this._map_object.map());
    /* create an info view when the data object is available, this fn handles this */
    this._infoview_create();
    /* let zones be selectable via clicking the respective legend entry */
    $('.'+this.ID_PREFIX+'_infolegend_entry').on('click', function(e) {
      let zone = $( this ).attr( 'data-zone' );
      this.highlight_current_zone(zone);
    }.bind(this));

    /* fit map to current window extension */
    this._map_object.map().fitBounds( bounds );
    this._map_object.map().setZoom( zoom );
    // this._map_object.map().panTo(new L.LatLng(51.4779, 0));
    // this._map_object.map().panTo(new L.LatLng(90.0, -180.0));
  } else if (suffix === "_modal") {
    /* add  map to modal */
    this._map_object.init( { /*zoom: 3*/ }, suffix );
    this._map_object.map().fitBounds( bounds );
    /* decrease zoom level in modal by one, b/c it doesn't fit within the same bounds elsewise. don't know if this is too hackish */
    this._map_object.map().setZoom(zoom-1);
  } else {
    /* throw an error */
    console.log('error adding map to', suffix);
  }

  /* grap the last selected state and apply it again, so the table and info view are as they were before removing the old map object */
  if ($.cookie('map_selected_zone')) {
    this.highlight_current_zone($.cookie('map_selected_zone'));
  }

  /** event hooks */
  this._map_object.map().on('moveend', function(e) {
    let bb = this._map_object.map().getBounds().toBBoxString();
    // TODO - disable saving state in modal, maybe?
    if (e.target._container.id.indexOf('_modal') !== -1) {
      zoom = this._map_object.map().getZoom()+1;
    } else {
      zoom = this._map_object.map().getZoom();
      if ($.cookie('map_selected_zone')) {
        this.highlight_current_zone($.cookie('map_selected_zone'));
      }
      /* replot plot */
      // this._plot.plot();
    }
    /* set cookies for boundingbox and zoom level to re-apply these values when reloading the application */
    $.cookie('map_boundingbox', bb);
    $.cookie('map_zoom', zoom);
    //console.log('map moveend event', e.target._container.id, e, 'bounds', this._map_object.map().getBounds(), 'zoom', bb, this._map_object.map().getZoom());

    if (this._obm) {
      this.remove_layer(this._obm);
    }
    if (15 <= zoom) {
      this.add_layer(this._obm, 'OBM buildings');
    }

  }.bind(this))
    .on('overlayadd', function(e) {
      console.log('... Overlay add', e.name);
      let bbox = this._map_object.map().getBounds().toBBoxString().split(',');
      $.cookie('overlay '+e.name, 1);
      // custom event to react to layer added
      let added_event = 'added_'+(e.name).replace(' ', '_'); // replace space /w _
      // console.log('added event send', added_event);
      $(document).trigger(added_event, [bbox]); // trigger and send current bbox
    }.bind(this))
    .on('overlayremove', function(e) {
      console.log('... Overlay remove', e.name);
      $.cookie('overlay '+e.name, 0);
    });

  /* adds a listener to table rows that will react to user-interaction with the tabled data representation */
  this._data_table_add_row_clicklistener();

  /** instancestate
   * FIXME - write a class to store all instance states of the app. do we actually need this? */
  let instancestate = new Instancestate();

  /** add some esri overlays. they look nice, so why not */
  // let esri = L.esri.basemapLayer("Topographic");
  // esri.addTo(this._map_object.map());
  // this._map_object.layercontrol().addOverlay(esri, 'esri map');

  // let bing = new L.BingLayer('AlxkFRFt1bwBkeqSDqWCYFDLwDs0q0HB91g18bl3EcItHi0l7lRaqRRp-z5d9H8F');

  let bing = L.tileLayer.bing('AlxkFRFt1bwBkeqSDqWCYFDLwDs0q0HB91g18bl3EcItHi0l7lRaqRRp-z5d9H8F');
  this.add_layer(bing, 'Bing');

  // let obm = L.tileLayer('http://c-tiles.obm.gfz-potsdam.de/tiles/obm-ground-area/{z}/{x}/{y}.png',{maxzoom:19});
  // this._obm = L.tileLayer('http://c-tiles.obm.gfz-potsdam.de/tiles/gem-position/{z}/{x}/{y}.png',{maxzoom:16});
  /* http://[a-f]-tiles.obm.gfz.pm/tiles/all-buildings/{z}/{x}/{y}.png 	   */
  /* */
  this._map_object._grid = new Grid(this);
  if (this.overlay_added(this._map_object._grid._layer_name)) {
    this._map_object._grid.draw_grid();
  } else {
    this._map_object._grid.draw_grid(null);
  }


  this._obm = L.tileLayer('http://a-tiles.obm.gfz.pm/tiles/all-buildings/{z}/{x}/{y}.png&tilesize={tileSize}&{test}',{
	maxzoom:16,
	tileSize: 256,
	test: 42, //function() { return Math.random(); }
  });
  this.add_layer(this._obm, 'OBM buildings');

};



Application.prototype.map_object = function()
{
  return this._map_object;
};


/** invoked from the @class Map object, once the map is ready and data is fetched */
Application.prototype.cb_map_ready = function()
{
  this._mymapready_def.resolve('map ready');
  /* done fetching data so we can be sure the legend control element is also available */
  this._stop_propagation('legend');
  this._stop_propagation('info');
  /* connect mouse events between the legend and the map */
  this._mouse_legend_map_interaction(this._map_object.overlays( this._map_object._description )[0]);
};


Application.prototype.add_layer = function(layer, l_name)
{
  console.log('Adding layer', l_name, layer);
  this._add_to_map(layer, l_name);
  // this._map_object.layercontrol().addOverlay(lay_obj, lay_dsc);
  // lay_obj.addTo(this._map_object._map);
};


/** Finally, add the overlayer to the L map and init some events */
Application.prototype._add_to_map = function(layer, l_name)
{
  if (this.overlay_added(l_name)) {
    layer.addTo(this._map_object.map());
  }
  this._map_object.layercontrol().addOverlay(layer, l_name);
  // fired when tile loading or loaded
  layer.on('loading', function (event) {
    // mapInstance.fireEvent('dataloading', event);
    console.log('Layer ',l_name,' loading.');
  }).on('load', function (event) {
    // mapInstance.fireEvent('dataload', event);
    console.log('Layer ',l_name,' loaded.');
  }).on('layerremove', function(event) {
    console.log('xxxxx');
  });

};


/** Returns true when the overlay layer @string l_name
    has been activated in the layer control or not
    @param l_name the name of the layer as displayed in the layer control
*/
Application.prototype.overlay_added = function(l_name)
{
  let cookie_name = 'overlay '+l_name;
  console.log('Overlay cookie', cookie_name, $.cookie(cookie_name), typeof $.cookie(cookie_name));
  if (typeof $.cookie(cookie_name) === 'undefined') {
    $.cookie(cookie_name, 1);
  }
  let cookie_value = parseInt($.cookie(cookie_name));
  if (cookie_value === 1) {
    return true;
  } else if (cookie_value === 0) {
    return false;
  }
  else {
    // error
    return null;
  }
};


Application.prototype.remove_layer = function(lay_obj)
{
  // console.log('removing layer', lay_obj);
  this._map_object.layercontrol().removeLayer(lay_obj);
  this._map_object._map.removeLayer(lay_obj);
};


/** cb fn to be invoked, when a new data set is available
 * @param {Data} object the assembled data object
 * <pre> data object - structure is as follows (an object of objects of gmpe-objects)
 * <pre> properties are: GMPE-Name, Period, Rank, Weight, selected, ... maybe more
 * <pre> *********************************************************
 *  /----------------------------------------------------\
 *  |- zone1 - a gmpe name - gmpe object with properties |
 *  |        - a gmpe name - gmpe object with properties |
 *  |        - ...                                       |
 *  |- zone2 - a gmpe name - gmpe object with properties |
 *  |        - a gmpe name - gmpe object with properties |
 *  |        - ...                                       |
 *  |- ...                                               |
 *  \----------------------------------------------------/
 * *********************************************************
 */
Application.prototype.cb_data_ready = function(data)
{
  // console.log('... cb_data_ready', data);
  /* set the application's data object */
  this._data_object = data;
  /* resolve data ready deferred object */
  this._mydataready_def.resolve('data ready');
  /* initialize the data displaying table */
  this.data_table_init();
};

/** stops click-through-propagation from div elements to the map, so clicking or dragging of leaflet control elements stops won't interact with the underlying leaflet map anymore */
Application.prototype._stop_propagation = function(div_id)
{
  /* get the id's div element */
  var div_element = L.DomUtil.get(div_id);
  if (div_element) {
    /* disable map click through */
    L.DomEvent.disableClickPropagation(div_element);
    /* disable map pan through */
    L.DomEvent.on(div_element, 'mousewheel', L.DomEvent.stopPropagation);
  }
};

/** hide */
Application.prototype._hide = function(div_id)
{
  var div_element = L.DomUtil.get(div_id);
  if (div_element) {
    /* hide div element */
    $(div_element).hide();
    // L.DomEvent.on(div_element, 'mousewheel', $(div_element).hide());
  }
};


/** creates an info view that is to be displayed in a corner of the map
 * <pre>this view displays the last shp layer feature that has been interacted with (e.g. clicked)
 * <pre>we need to wait for the data object to be available, so we implement it as a promise
 * see: {@link https://api.jquery.com/jquery.when/}
 * the deferred object mydata_def is resolved @fn {@link cb_data_ready}
 */
Application.prototype._infoview_create = function()
{
  $.when( this._mydataready_def ).done( function(msg) {
    /* set the info object that we use to change the content of the info view
     * via its update fn */
    // console.log('... this data object', this._data_object);
    this._infoview = this.mydatadisplay.infoview(this._data_object, this._style_object, this._legend_object._prefix);
    /* add the info view to the map */
    this._infoview.addTo(this._map_object.map());
    /* block mouse click and mouse wheel scroll events on the bottom left widget */
    this._stop_propagation('info');
    this._hide('info');

  }.bind(this));
};


Application.prototype._mouse_legend_map_interaction = function(overlay)
{
  console.log('... init mouse legend map interaction');
  var legend = this._legend_object;
  var style = this._style_object;
  let grid = this._map_object._grid;

  $('.'+legend._prefix+'_infolegend_entry').on('mouseover', function(e) {
    var completeness = $( this ).attr( 'data-value' );
    // let layers = overlay._layers;
    let layers = overlay._data._polygons._layers;
    let ids_as_keys = Object.keys(layers);
    // console.log('layers', layers);
    // console.log('mouse over', value, /*style,*/ overlay._layer._layers, '>>>', ids_as_keys);
    $.each(ids_as_keys, function(idx, key) {
      if (typeof layers[key].feature === 'undefined') {
        // console.log('undefined feature in', layers[key]);
      } else {
        // console.log('idx', idx, 'key', key, 'val', layers[key]);
        if (layers[key].feature.properties['completeness'] == completeness) {
          layers[key].setStyle({
            fillOpacity: 0.9
          });
        }
      }
    });

    // this._style_object({'type':'legendevent hover', 'properties':{'value':value}});
  }).on('mouseout', function(e) {
    var value = $( this ).attr( 'data-value' );
    let layers = overlay._data._polygons._layers;
    let ids_as_keys = Object.keys(layers);
    // console.log('mouseout overlay', overlay);
    $.each(ids_as_keys, function(idx, key) {
      if (typeof layers[key].feature === 'undefined') {
        // console.log('undefined feature in', layers[key]);
      } else {
        // console.log('idx', idx, 'key', key, 'val', layers[key]);
        // overlay._layer.resetStyle(layers[key]);
        let completeness = layers[key].feature.properties['completeness'];
        layers[key].setStyle(grid._styling[completeness]);
      }
    });
    // resetHighlight({'type':'mouseout', 'target':{'feature':{'properties':{'value':value}}}});
  }).on('click', function(e) {
    var value = $( this ).data( 'value' );
    // if (window.lastTappedEvent[$.cookie("current_vector_layer")].feature) {
    //   resetHighlight({'type':'legendevent click', 'target':{'feature':{'properties':{'value':value}}}});
    // }
    // highlightFeature({'type':'legendevent click', 'properties':{'value':value}});
    var target = {'feature':{'properties':{}}};
    target.feature.properties[style._feature_property_name] = value;
    style.callback({'type':'mouseout', 'target':target});

  });
};

/** highlights a zone in the table when a subheader is clicked and updates the info view
 * @param {String} zone
 */
Application.prototype.highlight_current_zone = function(zone)
{
  /** update the info field within the map, unless it hasn't been created yet */
  if (typeof this._infoview !== 'undefined') this._infoview.update(zone);
  /** save to cookie */
  $.cookie('map_selected_zone', zone);
  /** highlight current zone in table */
  $('.'+this.ID_PREFIX+'_tablerow').each(function() {
    if ( $( this ).attr( 'data-data-key' ) === zone ) {
      //$( this ).attr( 'value', res_local[ $( this ).attr('value-local') ] );
      $( this ).addClass('success');
      //console.log($(this), $(this).attr('data-data-key'), $(this).attr('type'));
    } else {
      $( this ).removeClass('success');
      //$( this ).html( res_local[ $( this ).attr('value-local') ] );
    }
  });
};

/** inits a table to display all data, for now the table is displayed in one of the tabs at the bottom of the page
 * <pre>we currently have two views on the data: one sorted by zone (that's the default) the other by gmpe. they can be switched between with a button
 * <pre>the zone sorted view is created by an @class {DataDisplay} object
 * <pre>the gmpe sorted view is created by "hand" (maybe we don't even need it)
 * @param {String} [which=zone]  zone to display
 * @return {nil}
 * @throws Error TODO - throw an error if @param which doesn't match a proper value
 * @todo recycle table views and don't recreate them everytime they are switched */
Application.prototype.data_table_init = function(which='zone')
{
  /* clear possibly existing table */
  $('#'+this.ID_PREFIX+'_data_table_wrapper').html('');
  /* prepare new table */
  $('#'+this.ID_PREFIX+'_data_table_wrapper').append('<table id="'+this.ID_PREFIX+'_data_table" class="table table-striped table-bordered table-hover table-condensed">');

  if (which === 'zone') {
    /* add table to html anchor */
    $('#'+this.ID_PREFIX+'_data_table').append( this.mydatadisplay.table_from_data(this._data_object, this._style_object) );

  } else if (which === 'gmpe') {
    /* print table head */
    $('#'+this.ID_PREFIX+'_data_table').append('<thead><tr>');
    $('#'+this.ID_PREFIX+'_data_table').append('<th>Zone</th><th>Period</th>');
    $('#'+this.ID_PREFIX+'_data_table').append('</tr></thead>');
    /* print table body */
    $('#'+this.ID_PREFIX+'_data_table').append('<tbody><tr>');
    $.each(this._data_object.data(), function(key, object) {
      // ...
      $.each(object, function(index, entry) {
        // ...
        row_with_this_gmpe = $('#'+this.ID_PREFIX+'_data_table tbody').find('tr th').filter(function(){
          return $(this).text() === entry.feature("GMPE-Name");
        });

        if (row_with_this_gmpe.length === 0) {
          /* add this entry-name as a sub-header element, but just once */
          $('#'+this.ID_PREFIX+'_data_table').append('<tr data-data-sort="'+which+'"'+'data-entry-GMPE-Name="'+entry.feature("GMPE-Name")+'">'+
                                                     '<th colspan="2">'+entry.feature("GMPE-Name")+'</th></tr>');
        }

        row_with_this_gmpe.parent().after('<tr style="background-color:'+this._style_object.feature_style_definition_rgba(key, 50)+
                                          '" class="'+this.ID_PREFIX+'_tablerow"'+' data-data-sort="'+which+'" '+ ' data-data-key="'+key+'" data-entry-GMPE-Name="'
                                          +entry.feature("GMPE-Name")+'" data-entry-Period="'+entry.feature("Period")+'">'+
                                          '<td>'+key+'</td>'+
                                          '<td>'+entry.feature("Period")+'</td>'+
                                          '</tr>');
      });
    });
  } else {
    /* throw error b/c which didn't match a proper value */
    console.log('error while creating data view table!');
  }
  /* add all closing tags */
  $('#'+this.ID_PREFIX+'_data_table').append('</tr></tbody>');
  $('#'+this.ID_PREFIX+'_data_table_wrapper').append('</table>');
};

/** adds a click listener to table rows */
Application.prototype._data_table_add_row_clicklistener = function()
{
  /** highlight clicked table rows
   * unbind existing listener first, then bind again
   */
  $('.table > tbody > tr').off('click').on('click', function(e) {
    /* switch this gmpe in the gmpes data array */
    sort = $( this ).attr( 'data-data-sort' );
    zone = $( this ).attr( 'data-data-key' );
    gmpe = $( this ).attr( 'data-entry-GMPE-Name' );
    period = $( this ).attr( 'data-entry-Period' );
    console.log($( this ).hasClass('info')?'row de-selected':'row selected', 'zone:', zone, 'gmpe:', gmpe, 'period:', period, this);
    /* the table has subheader rows and data rows containing data belonging to a subheader
     * in the zone table-view the subheader is the zone (Active, Azores-Gibralter, ...) and the rows are the gmpes
     * we distinguish what kind of row has been clicked by looking at the data- html attributes of the respective row
     * precisely at which data- attributes are missing. there are 3 to be expected: data-entry-Period, data-entry-GMPE-Name and data-data-key
     * in our case data-data-key is the zone, data-entry-GMPE-Name is the gmpe, data-entry-Period is the period
     * if all three are present it's a data row, if period is missing but gmpe is present it's a header in gmpe view, else one in zone view
     * the following table shows what data-html attributes to expect
     *
     * zone gmpe period
     *   ✓    x    x   (list header zone)
     *   x    ✓    x   (list header gmpe)
     *   ✓    ✓    ✓   (list row)
     *
     * something table just has been clicked, so we first look at the period data- attribute ...
     */
    if (typeof period !== 'undefined') { /* ... it's a non-subheader row */
      /* switch the selected attribute toggle in the data object */
      this._data_object.data(zone,gmpe+period).selected( !this._data_object.data(zone,gmpe+period).selected() );
      /* select the same row in the table as well as in the info view */
      other_element_class = '.'+this.ID_PREFIX+'_tablerow';
      if ($( this ).hasClass(''+this.ID_PREFIX+'_tablerow')) {
        other_element_class = '.'+this.ID_PREFIX+'_info_tablerow';
      }
      /* criteria by which to find the other row */
      other_element_attribs = '[data-data-key="'+zone+'"]'+
        '[data-entry-GMPE-Name="'+gmpe+'"]'+
        '[data-entry-GMPE-Name="'+gmpe+'"]'+
        '[data-entry-Period="'+period+'"]';

      if (sort === 'zone' || sort === 'infoview' ) {
        /* select or deselect the clicked table row */
        if ($( this ).hasClass('info')) {
          $( this ).removeClass('info');
          $(other_element_class+other_element_attribs).removeClass('info');
        } else {
          $( this ).addClass('info');
          $(other_element_class+other_element_attribs).addClass('info');
        }
      } else if (sort === 'gmpe') {
        /* highlight rows with of the same zone */
        this.highlight_current_zone(zone);
      } else {
        /* throw an eror */
        console.log('error detected clicked target', this);
      }
    } else if (typeof gmpe !== 'undefined') {
      /* ... a header in the list (gmpe) */
    } else if (typeof zone !== 'undefined') {
      /* ... a header in the list (zone) */
      this.highlight_current_zone(zone);
    } else {
      /* throw error */
      console.log('error while processing clicked row!');
    }
  });
};


/** inits the modal that contains the map when scrolled down
 * <pre>our site technically can scroll down forever, so we want some behavior that keeps the map visible when the big map is scrolled out of the visible pane
 * we therefor transfer the map object into a modal that keeps hovering at the right side of the window
 * the map is transfered back when the big map view container becomes visible within the pane
 * <pre>see: {@link https://www.w3schools.com/bootstrap/bootstrap_modal.asp} */
Application.prototype._map_modal_init = function()
{
  /*  */
  $('body').scrollspy({ target: '#'+this.ID_PREFIX+'_scrollspy', offset: 150 });
  $('#'+this.ID_PREFIX+'_scrollspy').on('activate.bs.scrollspy', function (e) {
    if ( $(e.target.innerHTML)[0].hash === '#map' ) {
      $('#myModal').modal('hide');
    } else if ( $(e.target.innerHTML)[0].hash === '#data' ) {
      $('#myModal').modal('show');
    }
  });

  /* let the modal be draggable on top and bottom part of the frame */
  $(".modal-dialog").draggable({
    handle: '.modal-frame-element'
  });

  /* adds an indicator to the modal that makes it resizable by dragging */
  $(".modal-content").resizable({
    minHeight: 300,
    minWidth: 300
  });

  /* Occurs when the modal is about to be shown
   * see: {@link https://www.w3schools.com/bootstrap/bootstrap_ref_js_modal.asp}
   * the modal is shown when the application is scrolled down
   * or when the "data" navigation item in the top bar is clicked */
  $("#myModal").on('show.bs.modal', function() {
    /* transfer the map from the big view into the modal */
    this.map_init('_modal');
    /* adad some css to fit it quite right on the screen */
    $(this).find('.modal-body').css({
      'max-height':'75%'
    });
    var offset = 330;
    $(this).find('.modal-body').attr('style','max-height:'+($(window).height()-offset)+'px !important;');
  }.bind(this));

  /* Occurs when the modal is fully shown (after CSS transitions have completed)
   * see: {@linkhttps://www.w3schools.com/bootstrap/bootstrap_ref_js_modal.asp}
   * we apply some minor css stuff here, put the modal to the front, rescale the map if rescaled, etc
   * */
  $("#myModal").on('shown.bs.modal', function() {
    //mymap.sidebar();
    /* allow scrolling of underlying site */
    $("body").removeClass("modal-open");
    /* allow interaction with underlying site */
    //$('#myModal').css( "zIndex", 1 );
    /* remove click events from the modal backdrop */
    $('#myModal').css( "pointer-events", 'none' );
    /* re-add click events to the modal window only */
    $('.modal-content').css( "pointer-events", 'auto' );
    /* allow modal window to be layered above upper nav bar */
    $('#myModal').css( "zIndex", 1050 );
    $('.modal-backdrop').hide();
    /* adjust map to modal dimensions */
    this._map_object.map().invalidateSize();
  }.bind(this));

  /* Occurs when the modal is fully hidden (after CSS transitions have completed)
   * see: {@link}https://www.w3schools.com/bootstrap/bootstrap_ref_js_modal.asp}
   * the modal is hidden, either by scrolling up or clicking the map entry in the top bar
   * so we transfer the map from the modal to the big view
   * */
  $("#myModal").on('hidden.bs.modal', function() {
    this.map_init();
    this._map_object.map().invalidateSize();
    //$('#myModal').css( "zIndex", 1050 );
  }.bind(this));
};


// 22.0, 35.0, 29.0, 44.0
// TODO uncomment
Application.prototype._download_json_popup = function(json)
{
  // let json_uri_encd = encodeURIComponent(json);

  $("<a />", {
    "download": "grid.json",
    "href": "data:application/json,"+ json //json_uri_encd
    // "href" : "data:application/octet-stream;charset=utf-16le;base64,"+ json //json_uri_encd
  }).appendTo("body")
    .click(function() {
      $(this).remove();
    })[0].click();

  // console.log('Download Json type', typeof json, 'Content', json);
};


Application.prototype._behavior_and_events_init = function()
{
  /** rest */
  /* bootstrap dropdown plugin init */
  $('.dropdown-toggle').dropdown();
  /* FIXME - what does this do now? */
  // populize_sidebar();
  /* run the localization script over the site
   * FIXME - this doesn't do anything right now, does it? as we don't localize. */
  /* localize_document(); */

  /* the download button has been clicked
     add a temporary element to allow downloading the grid layer */
  $('#'+this.ID_PREFIX+'_download_grid').click(function(e){
    // southwest_lng, southwest_lat, northeast_lng, northeast_lat
    let bbox_str = $('#'+this.ID_PREFIX+'_bbox_coords').val();

    if (bbox_str.length > 0) {
      let bbox = bbox_str.split(/[,;]/);
      // let bbox = [23.5, 38.0, 24.0, 38.5];

      /* TODO check whether  */
      let can_as_JSON = false;
      if (can_as_JSON) {
        /* the area is small enough for the browser to handle downloading as json */
        this._map_object._grid.features_grid_from_bbox(bbox).then(function(features) {
          let poly = {"type":"FeatureCollection",
                      "features":features};
          // let json = L.geoJSON(poly, this._map_object._grid._style.layer_style_definition());
          // let json = JSON.stringify(squares.toGeoJSON());

          let json = JSON.stringify(poly);
          console.log('features', features);
          this._download_json_popup(json);
        }.bind(this));
      } else {
        this._map_object._grid.get_completeness_from_bbox(bbox).then(function(response){
          // TODO what to do here?
          let json = JSON.stringify(response);
          this._download_json_popup(json);
        }.bind(this));
      }

    } else {
      /* empty input field, so download current viewport */
      console.log('Preparing current viewport for download.');
      let grid = this._map_object._grid;
      let json = grid.as_JSON();
      this._download_json_popup(json);
    }
  }.bind(this));

  /** site event hooks */
  $(window).on('resize', function (e) {
    /* dynamically adjust modal content element dimension */
    $(e.target).find('.modal-body').css({
      'max-width':'100%',
      'max-height': ($(e.target).height() - 120) + 'px'
    });
    $(e.target).find('#'+this.ID_PREFIX+'_leafletmap_modal').css({
      'max-width':'100%',
      'height': ($(e.target).height() - 160) + 'px'
    });
    /* re-calc map extends on window resize */
    this._map_object.map().invalidateSize();
  }.bind(this));

  /** add click listener to the "sort by" dropdown button entries
   * this will re-build the table */
  $('#'+this.ID_PREFIX+'_sort_by_zone').click(function() {
    /* a table with sub-headers grouped by zone name */
    this.data_table_init('zone'); this.data_table_add_row_clicklistener();
    if ($.cookie('map_selected_zone')) { this.highlight_current_zone($.cookie('map_selected_zone')); }
    return false;
  }.bind(this));
  $('#'+this.ID_PREFIX+'_sort_by_gmpe').click(function() {
    /* a table with sub-headers grouped by gmpe name */
    this.data_table_init('gmpe'); this.data_table_add_row_clicklistener();
    if ($.cookie('map_selected_zone')) { this.highlight_current_zone($.cookie('map_selected_zone')); }
    return false;
  }.bind(this));
  /** a plot button
   * FIXME - currently does nothing, just a stub */
  $('#'+this.ID_PREFIX+'_button_plot').click(function() {
    console.log('plot button clicked');
    return false;
  }.bind(this));

  /* FIXME - fill sidebar top and bottom entries */
  $.each(top_entries, function() {
    //gfz_obm_sidebar_topentries
    $('#'+this.ID_PREFIX+'_sidebar_topentries').html( '<li><a href="#' + '$entry->id()->get()' + '" role="tab"><i class="' + '$entry->icon()' + '"></i></a></li>' );
  }.bind(this));
  $.each(bottom_entries, function() {
    //gfz_obm_sidebar_bottomentries
    // echo '<li><a href="#' . $entry->id()->get() . '" role="tab"><i class="' . $entry->icon() . '"></i></a></li>';
    $('#'+this.ID_PREFIX+'_sidebar_bottomentries').html( '<li><a href="#' + '$entry->id()->get()' + '" role="tab"><i class="' + '$entry->icon()' + '"></i></a></li>' );
  }.bind(this));

};

Application.prototype.ignore = function(ignore_keys)
{
  if (ignore_keys) {
    this._ignore_keys = ignore_keys;
    return true;
  } else {
    return this._ignore_keys;
  }
};

/** sets a new style for the overlays  */
/* FIXME allow own style for each layer seperately */
Application.prototype.overlay_style = function(layer_description, feature_name, feature_style_def, display_features = [])
{
  console.log('... new overlay style invoked (@fn:overlay_style) for layer "', layer_description, '", styling by feature name "', feature_name, '"');

  /** define a style for the vector layer */
  /** set a style for the vector layer if both params are set */
  if (feature_name && feature_style_def) {
    // FIXME
    this._style_object = this._vector_feature_styling(feature_name, feature_style_def, display_feature_upon);
  } else if (feature_name) {
    $.when(this._mymapready_def).done( function(msg){

      // console.log('... done (@fn:overlay_style):', msg, Object.values(this._map_object.overlays()));
      $.when(this._map_object.overlay_deferred(layer_description)).done( function(msg){

        console.log('... done (@fn:overlay_style):', msg, ' - setting style for overlay:', layer_description, 'overlay', this._map_object.overlays(layer_description), 'of:', Object.values(this._map_object.overlays()));
        this._process_layer(layer_description, feature_name, display_features);
      }.bind(this));

    }.bind(this));

  }
};

Application.prototype._process_layer = function(layer_description, feature_name, display_features)
{
  let overlay = this._map_object.overlays(layer_description);
  let grid = this._map_object._grid;
  console.log('... processing layer (@fn:_process_layer)', overlay, 'by feature name "', feature_name, '"');
  /* iterate over all overlays and apply a new style */
  // var feature_style_def = {};
  // // console.log('... layer added callback: description', description, 'layer', layer);
  // var _layer = overlay._layer;
  // $.each(_layer._layers, function(_, _layer) {
  //   var p = _layer.feature.properties[feature_name];
  //   console.log('_layer.feature.properties', _layer.feature.properties, feature_name, p);
  //   if (typeof p !== 'undefined') {
  //     /* random hex color codes, see: https://www.paulirish.com/2009/random-hex-color-code-snippets/ */
  //     feature_style_def[p] = grid._feature_style_def[p]; // '#'+Math.floor(Math.random()*16777215).toString(16);
  //   }
  // });

  let feature_style_def = grid._feature_style_def;

  console.log('... values', feature_name, JSON.stringify(feature_style_def));
  // here no explicit style display_feature_upon function is passed into the function
  this._style_object = this._vector_feature_styling(feature_name, feature_style_def);

  $.each(this._overlays, function(_, _overlay) {
    console.log('... overlay remove', _overlay, 'found in map', this._map_object.overlays(overlay[0]));
    /* remove current layer by description value and new one */
    // this._map_object.remove_layer(_overlay[0]);
    /* start the deferred object */
    // this._map_object.data_deferred(layer_description);
    /* [0]: description, [1]: url  */
    // this._map_object.add_json_layer(_overlay[0], _overlay[1], this._style_object, this._ignore_keys);
  }.bind(this));

  $.when(this._map_object.data_deferred(layer_description)).done( function(msg, data) {
    console.log('... done: @fn:process_layer', msg, data, 'display_features', display_features);
    /* remove old legend and add new one based on just calculated style */
    this._map_object.map().removeControl(this._legend_object.legend());

    var display_feature_upon; // hand in none, should translate to function(x){return x;}
    if (typeof display_features !== 'undefined' && display_features.length > 0) {
      // the array is defined and has at least one element
      var disp_arr = {};
      /* the feature value we currently colorize the map upon */
      var group_name = feature_name;

      $.each(data.data(group_name), function(i, entry) {
        // console.log('... entry', i, entry);
        /* build up the legend display string */
        var disp_entry = '';
        $.each(display_features, function(j, feature) {
          var seperator = j==0?'':', ';
          disp_entry += seperator + entry._properties[feature];
        });
        disp_arr[i] = disp_entry; // v._properties[display_features[0]];
      });
      display_feature_upon = function(key) {
        return disp_arr[key];
      }.bind(this);
    }

    /* create a new style object, entry display string defaults to display_feature_upon = function(x){return x;}; */
    this._style_object = this._vector_feature_styling(feature_name, feature_style_def, display_feature_upon);
    /* with the new style object create the legend */
    this._legend_object = new Legend(this._style_object, this.ID_PREFIX);
    /* add the legend to the map*/
    this._legend_object.legend().addTo(this._map_object.map());
    /* prevent map interaction through the legend widget */
    this._stop_propagation('legend');
    /* connect mouse events between the legend and the map */
    this._mouse_legend_map_interaction(this._map_object.overlays( this._map_object._description )[0]);
    /* */
    // this._hide('legend');

    /* callback to set up the data object and to resolve the data ready deferred */
    this.cb_data_ready(data);
  }.bind(this));

};

/** creates an @class Style object that may be used to style the map's vector overlays
 * @param {Object} [style_def = {}] a style def object
 * @returns {Style} a style object to be used as parameter when creating the shp layer
 */
Application.prototype._vector_feature_styling = function(feature_name, feature_style_def, display_feature_upon)
{
  /* FIXME remove */
  // this._plot = new Plot();
  this._layer_style_def,
  cb = function(e) {
    var value = e.target.feature.properties[feature_name];
    console.log('... click callback features', value, e);
    this.highlight_current_zone(value);
    var plot_data = 'data/buildingcount/'+value+'.dat';
    this._plot.plot(plot_data, this._style_object._display_feature_upon(value));
  }.bind(this);
  cb = null;
  return new Style(this._layer_style_def, feature_name, feature_style_def, cb, display_feature_upon);
};


/** initializes some global variables
 */
Application.prototype._init_variables = function()
{
  /** @global */
  this.SIDEBAR_ID = 'sidebar',
  /** @global */
  this.ID_PREFIX = 'gfz_obm',
  /** @global */
  this.MAP_ID = 'leafletmap';
  /** a definition onto how each feature is to be colorized */
  /* a https://api.jquery.com/category/deferred-object/ to be called when data is available, see @fn {cb_data_ready} */
  /** @global */
  this._mydataready_def = $.Deferred(),
  /** @global */
  this._mymapready_def = $.Deferred(),
  /** @global */
  this._layer_style_def = {weight: 2,
                           opacity: 0.2,
                           color: 'blue',
                           dashArray: '2',
                           fillOpacity: 0.025
                          },
  /* an @class {DataDisplay} object. we use this to create certain representations of the data (tables, ...) */
  /** @global */
  this.mydatadisplay = new DataDisplay( ['GMPE-Name', 'Rank', 'Weight', 'Period'], this.ID_PREFIX );
  /** @global */
  this.top_entries = {},
  /** @global */
  this.bottom_entries = {},
  /** @global */
  this.zipfilereader = new ZipFileReader('feature_dropfield_layer');
  /* FIXME - invoke mock script to get some data. remove when we have actual data! */
  // $.getScript( "scripts/test/mock.js", function( data, textStatus, jqxhr ) { /*...*/ } );
};
