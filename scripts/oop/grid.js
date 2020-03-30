/** map grid overlay
 * inherits from {@link }
 * <pre>ctor
 * @constructor
 */
function Grid(application)
{
  this._map_object = application.map_object();
  this._layer_name = 'Completeness grid';
  this._feature_name = 'completeness';
  this._feature_unique_id = 'id';
  this._layer = null;
  this._url = './bin/cmpltnss.bin';
  this._max_zoom = 15; // 13
  this._cell_frac_denominator = 360.0;
  this._cell_width = 1/360;
  this._cell_height = this._cell_width;
  this._application = application;

  this.SHOW_POPUP = false;

  this._feature_style_def = {
    0b000:'#777777', // unknown, grey
    0b001:'#12a813', // complete, green
    0b010:'#ffff00', // almost complete,
    0b011:'#e4808c', // incomplete, red
    0b100:'#ffffff', // undecidable,
    0b101:'#6a5acd', // H2O, slate blue
    0b110:'#f4863a', // complete (empty)
  };

  /* parent ctor */
  this.Layer_ctr.call(this, this._layer_name, this._url, 'callbacks', this._feature_style_def);

  this._styling = {
    0b000: {color:'#aaaaaa', opacity:.4, fillColor: '#777777', fillOpacity:.4}, // unknown, grey
    0b001: {color:'#80ff00', opacity:.4, fillColor: '#12a813', fillOpacity:.2}, // complete, green
    0b010: {color:'#ff8000', opacity:.6, fillColor: '#ffff00', fillOpacity:.4}, // almost complete, orange
    0b011: {color:'#ff808c', opacity:.4, fillColor: '#e4808c', fillOpacity:.2}, // incomplete, red
    0b100: {color:'#ff8000', opacity:.6, fillColor: '#ffffff', fillOpacity:.4}, // undecidable, orange
    0b101: {color:'#aaaaaa', opacity:.0, fillColor: '#6a5acd', fillOpacity:.0}, // H2O, slate blue
    0b101: {color:'#ff763a', opacity:.4, fillColor: '#f4863a', fillOpacity:.2}, // H2O, slate blue
  };

  this._completeness_categories = {
    0b000:'Unknown', // unknown, grey
    0b001:'Complete', // complete, green
    0b010:'Almost complete', // almost complete, turquoise
    0b011:'Incomplete', // incomplete, red
    0b100:'Undecidable', // undecidable, white
    0b101:'Irrelevant (Water)', // H2O, slate blue
    0b110:'Complete (empty)', // complete (empty)
  };

  this._layers = {};
  this._rect_options = {color: '#AAAAAA', fillOpacity: .2, weight: 1, onEachFeature: this._on_each_feature.bind(this)};
  this._style = new Style(this._rect_options, this._feature_name, this._feature_style_def);

  this.UNKNOWN = 0b000; //0000000000000;
  this.COMPLETE = 0b001; //0000000000000;
  this.ALMOST_COMPLETE = 0b010; //0000000000000;
  this.INCOMPLETE = 0b011; //0000000000000;
  this.UNDECIDABLE = 0b100; //0000000000000;
  this.H2O = 0b101; //0000000000000;

  this._completeness_values = {
    0:this.UNKNOWN, //0000000000000;
    1:this.COMPLETE, //0000000000000;
    2:this.ALMOST_COMPLETE, //0000000000000;
    3:this.INCOMPLETE, //0000000000000;
    4:this.UNDECIDABLE, //0000000000000;
    5:this.H2O //0000000000000;
  };

  this.rectangle = null;
  this._prepare_ajax_binary();

  /* rest */
  this._bind_events();
  // this.draw_grid();
}

/** inherit from @class Layer */
Grid.prototype = Object.create(Layer.prototype);
/** get reference to parent ctors  */
Grid.prototype.Layer_ctr = Layer;


Grid.prototype._bind_events = function()
{
  this._application.map_object()._map
    .on('zoomend moveend', function(e){
      console.log('zoomend moveend event', e);
      if (this._dropdown) {
        // remove the batch edit dropdown if it exists
        this._map_object._map.removeControl(this._dropdown);
      }

      this.draw_grid();
    }.bind(this))
    .on('boxzoomend', function(e) {
      // console.log('boxzoomend', e);
      let bbox = L.rectangle(e['bbox']);
      let selected = this._ids_by_bbox(bbox);
      this._drop_down_menu(selected);
    }.bind(this));
};


Grid.prototype._drop_down_menu = function(selected)
{
  let map = this._map_object._map;
  let _dropdown = L.control({position: 'topright'});
  let categories = this._completeness_categories;
  if (this._dropdown) {
    // remove the batch edit dropdown if it exists
    map.removeControl(this._dropdown);
  }

  _dropdown.onAdd = function (map) {
    let _div = L.DomUtil.create('div', 'completeness_dropdown');
    let select_HTML = '<select><option disabled selected value> -- Completeness -- </option>';

    for (let cat in categories) {
      select_HTML += '<option value="' + cat + '">' + categories[cat] + '</option>';
    }
    // select_HTML += '<option value="xxx">option 1</option><option>option 2</option><option>option 3</option></select>';
    select_HTML += '</select>';
    _div.innerHTML = select_HTML;
    _div.firstChild.onmousedown = _div.firstChild.ondblclick = L.DomEvent.stopPropagation;
    // L.DomEvent.on(_div, 'click', this._click);
    return _div;
  };

  let layers = this._layers;
  let ajax_call = this._ajax_set_completeness.bind(this);
  // let styling = this._styling;
  _dropdown.addTo(map);
  this._dropdown = _dropdown;

  $('select').change(function(e) { //when user selects a country from the drop down list
    let completeness = $(this).val();
    // console.log('Change new completeness', completeness, 'for', selected);
    let data = {};
    selected.forEach((key,i) => data[key] = parseInt(completeness));
    ajax_call(data);
    map.removeControl(_dropdown);
  });
};


Grid.prototype.get_completeness_from_bbox = function(bbox)
{
  let cell_side = this._cell_height;

  /* SW Lon, SW Lat, NE Lon, NE Lat
     adjust bbox to grid
  */
  bbox = this._adjust_bbox2grid(bbox, cell_side);

  /* Chrome doesn't keep a copy of the object like it was when you used console.log, it uses references and evaluates the object when you inspect it. If you want to see the object like it is when you console.log it you should JSON.stringify() it
   */
  /* here we assume a bbox type encapsulation
     TODO encapsulate with irregular polynom, e.g. administrative border */
  let line_cell_count = 0;
  for (let lon=bbox[0]; lon<=bbox[2]; lon+=cell_side) {
    line_cell_count += 1;
  }
  console.log('line_cell_count', line_cell_count);

  /* We want to shrink the cell matrix to the vector of only the left column
     We later attach each line/row length to it*/
  // bbox[2] = bbox[0];

  /* Get the WSG84 coordinates of each of the first column's cells */
  let cell_coords_lines = this._cell_coords_by_line([bbox[0],bbox[1],bbox[0],bbox[3]], cell_side);
  // console.log('cell_coords_lines', cell_coords_lines);

  /* Transform @array cell_coords_lines into an array of cell id: cell coords
     So we have the first column of ids and real world coordinates
  */
  let ids_coords_lines = this._ids_coords_by_line(cell_coords_lines);
  console.log('ids coords by line', ids_coords_lines);

  /* Into the python script we only forward (left) cell ids
     and the length of each respective line */
  let ids_offsets_lines = {};
  for (let idx in ids_coords_lines) {
    let line_keys = Object.keys(ids_coords_lines[idx][0]);
    let most_left_key = line_keys[0];
    let line_length = line_cell_count; //line_keys.length;
    ids_offsets_lines[most_left_key] = line_length;
  }
  console.log('ids offsets lines', ids_offsets_lines);

  /* Invoke python script to return completeness */
  return this._ajax_get_completeness(ids_offsets_lines).then(function(response) {
    console.log('... get Ajax response',Object.keys(response).length ,'lines', response);
    return response;
  }.bind(this));
};


Grid.prototype._ajax_get_completeness = function(_data)
{
  /* define an action type so we can distinguish between set and get */
  let _d = {'action': 'get',
            'cells': _data};

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
      console.log('grid.wsgi post response', response);
      return response;

    },
    error: function (xhr, ajaxOptions, thrownError) {
      console.error('error fetching data', thrownError, xhr.status, xhr.responseText, xhr );
    }
  });
};


Grid.prototype._ajax_set_completeness = function(_data)
{
  /* define an action type so we can distinguish between set and get */
  let _d = {'action': 'set',
            'cells': _data};
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


Grid.prototype._ids_by_bbox = function(bbox)
{
  let grid = this._layer.toGeoJSON();
  let bb = bbox.toGeoJSON();
  // intersection
  let selected = [];
  for (let idx in grid['features']) {
    let feature = grid['features'][idx];
    let intersection = turf.booleanContains(bb, feature);
    if (intersection == true) {
      // console.log('Grid layer intersection: ', 'grid', feature, ', bbox', bb);
      selected.push(feature.properties.id);
    }
  }

  if (selected.length > 0) {
    for (let idx in selected) {
      let id = selected[idx];
      // console.log('Selected feature ', id);
      // TODO make feature styling nicer, maybe permenant for the time of editing
      this._layers[id].setStyle({
        color: '#0000ff',
        dashArray: '',
        opacity: .95,
        fillOpacity: .0
      });
    }
  }
  return selected;
};


Grid.prototype._adjust_bbox2grid = function(bbox, cell_side)
{
  let _bbox = new Array(4);
  /* SW Lon, SW Lat, NE Lon, NE Lat */
  _bbox[0] = parseFloat(bbox[0] - ((bbox[0]+180.0) % cell_side));
  _bbox[1] = parseFloat(bbox[1] - (bbox[1] % cell_side));
  _bbox[2] = parseFloat(bbox[2] + (cell_side - (bbox[2]+180.0) % cell_side));
  _bbox[3] = parseFloat(bbox[3] + (cell_side - bbox[3] % cell_side));
  console.log('... adjusted BBOX', bbox, 'to', _bbox);
  return _bbox;
};


/** Returns @type array of cell coordinates by line */
Grid.prototype._cell_coords_by_line = function(bbox, cell_side, interlace_factor)
{
  if (typeof interlace_factor === 'undefined') {
    interlace_factor = 1;
  }
  console.log('... Using every', interlace_factor, 'cells');

  /* SW Lon, SW Lat, NE Lon, NE Lat */
  bbox = this._adjust_bbox2grid(bbox, cell_side);
  // bbox[0] = parseFloat(bbox[0] - ((bbox[0]+180.0) % cell_side));
  // bbox[1] = parseFloat(bbox[1] - (bbox[1] % cell_side));
  // bbox[2] = parseFloat(bbox[2] + (cell_side - (bbox[2]+180.0) % cell_side));
  // bbox[3] = parseFloat(bbox[3] + (cell_side - bbox[3] % cell_side));
  console.log('... Bbox', JSON.stringify(bbox));

  let cell_coords_lines = [];
  // for (let lon=bbox[0]; lon<=bbox[2]; lon+=cell_side)
  let lon=bbox[0];
  let lon_limit = Math.round(100000000*bbox[2], 8)/100000000;
  do {
    // let cc_line = [];
    let i = 0;
    /* go from top to bottom */
    for (let lat=bbox[3]; lat >=bbox[1]; lat-=interlace_factor*cell_side) {
      let coord_arr = [[lon,lat],[lon+cell_side,lat],[lon+cell_side,lat-cell_side],[lon,lat-cell_side],[lon,lat]];
      // cell_coords.push(coord_arr);

      if (cell_coords_lines.length > i) {
        // ...
      } else {
        cell_coords_lines.push([]);
      }
      cell_coords_lines[i].push(coord_arr);
      // cc_line.push(coord_arr);
      i += 1;
    }
    lon+=cell_side;
  } while(lon < lon_limit)

  return cell_coords_lines;
};



Grid.prototype._id2coords = function(id)
{
  // 129600*y_coord + x_coord = id;
  // 360.0*y_int + 360.0*y_frac = y_coord; // = 360.0*(x)
  // 360.0*x_int + 360.0*x_frac = x_coord; // = 360.0*(y)

  // x = x_int + x_frac;
  // y = y_int + y_frac;

};

/** @param cell_frac_denominator cells, parts of a square def in Lon or Lat directions, e.g. denominator of 360 means 360*360 cells per square degree, which translates to a cell size of 0.0027777777... degree */
Grid.prototype._coords2id_new = function(coords, cell_frac_denominator)
{
  /* upper left, upper right, bottom right, bottom left, upper left
     0/4 -- 1
     |      |
     3 ---- 2

     o -----> (x)
     |
     |
     v (y)
  */
  let y = 90.0-coords[3][1]; // y id running from north to south
  let x = coords[0][0] + 180.0; // x id running from -180 Deg to +180 Deg
  let y_coord = cell_frac_denominator*y;
  let x_coord = cell_frac_denominator*x;
  let id_float = 129600.0 * y_coord + x_coord;
  let id = parseInt(Math.round(id_float,0)); // I think we should round b/f casting to integer

  // console.log('_coords2id_new', coords, '=> id float', id_float, ', int', id, 'y_coord', y_coord, 'x_coord', x_coord, 'cell_size', 1/cell_frac_denominator);
  return id;
};

// TODO the frac part can be removed
Grid.prototype._coords2id = function(coords)
/** @deprecated */
{
  /* upper left, upper right, bottom right, bottom left, upper left
     0/4 -- 1
     |      |
     3 ---- 2

     o -----> (x)
     |
     |
     v (y)

  */
  let y = 90.0-coords[2][1]; // y id running from north to south
  let x = coords[0][0] + 180.0; // x id running from -180 Deg to +180 Deg
  let y_frac = y%1;
  let y_int = y-y_frac;
  let x_frac = x%1;
  let x_int = x-x_frac;
  let y_coord = 360.0*y_int + 360.0*y_frac;
  let x_coord = 360.0*x_int + 360.0*x_frac;
  // console.log(i, 'coords (x,y)', x, y, 'split x (int,frac)', x_int, x_frac, 'y (int,frac)', y_int, y_frac);
  let id_float = 129600.0 * y_coord + x_coord;
  let id = parseInt(id_float);

  // console.log('_coords2id', coords, '=> id float', id_float, ', int', id);
  return [id, id_float];
};



/** Transform @array cell_coords_lines  */
Grid.prototype._ids_coords_by_line = function(cell_coords_lines)
{
  let ids_coords_lines = new Array(cell_coords_lines.length);
  for (let i=0; i<ids_coords_lines.length;i++) {
    ids_coords_lines[i] = [];

    let ids_coords_line = {};
    let got_id_error = false;
    let err_cnt = 0;
    let id, id_new, id_float = -1;
    $.each(cell_coords_lines[i], function(_, coords) {
      // TODO we need to replace _coords2id with _coords2id_new
      // TODO we also need to check whether _coords2id_new does the calc right
      [id, id_float] = this._coords2id(coords);
      id_new = this._coords2id_new(coords, this._cell_frac_denominator);

      if (id !== id_new) {
        err_cnt += 1;
        got_id_error = true;
      }

      ids_coords_line[id] = coords;
    }.bind(this));

    if (got_id_error === true) {
      console.error('id', id, 'id (float)', id_float, 'does not match id (new)', id_new, 'err cnt', err_cnt);
    }

    ids_coords_lines[i].push(ids_coords_line);
  }
  return ids_coords_lines;
};


Grid.prototype._binaries_lines = function(ids_coords_lines, interlace_factor)
{
  let line_cnt = 0;
  let binaries_lines = new Array(ids_coords_lines.length);
  for (let line in ids_coords_lines) {
    // console.log('>>>', ids_coords_lines[line][0]);
    let keys = Object.keys(ids_coords_lines[line][0]).sort();
    /* ids_coords_lines array of cell ids in this line */
    let length = keys.length; // length of the array
    let count = keys[length-1] - keys[0]; //
    // console.log('TODO, count', count, 'length', length, 'interlace fac', interlace_factor);

    /* we need to check if the difference between the west and east cell id
       is equal to the length of the array */
    // if (count != interlace_factor*(length-1)) {
    /** TODO since we for now are only interlacing line, don't muliply by interlace factor */
    if (count != (length-1)) {
      console.log('Error', 'TODO', 'offset+count',count,'and length', length, 'do not match!');
      console.log('Error', 'TODO', 'keys', keys);
    } else {
      let offset = keys[0];
      // fetch completeness for this line from binary file
      let binary = this.binary_at(this._url, offset, count);
      binaries_lines[line_cnt] = binary;
      line_cnt += 1;
      // console.log('Line', line, ', Length', length, ', Diff (last-first)', count, 'id0', offset);
    }
  }
  return binaries_lines;
};


Grid.prototype.features_points_from_bbox = function(bbox, interlace_factor)
{
  console.log('... Assembling features POINTS layer from bbox', bbox);

  let cell_side = this._cell_width; // the side of a cell in both lon lat direction
  /* the corner coordinates of all cells by line */
  let cell_coords_lines = this._cell_coords_by_line(bbox, cell_side, interlace_factor);
  console.log('cell coords by line', cell_coords_lines);
  /* transform the cell coordinates into a data structure of objects of cell coordinates by cell id and by line */
  let ids_coords_lines = this._ids_coords_by_line(cell_coords_lines);
  console.log('ids coords by line', ids_coords_lines);

  /* Query the bin file line by line */
  this.binaries_lines = this._binaries_lines(ids_coords_lines, interlace_factor);
  // console.log('binaries lines', this.binaries_lines);

  let features = [];
  let features_matrix = [];
  return Promise.all(this.binaries_lines).then(function(results) {
    console.log('... results', results, 'arguments', arguments);

    return 'TODO';
  });

};


/** calculates  */
Grid.prototype.features_grid_from_bbox = function(bbox, interlace_factor)
{
  console.log('... Assembling features GRID layer from bbox', bbox);

  let cell_side = this._cell_width; // the side of a cell in both lon lat direction
  /* the corner coordinates of all cells by line */
  let cell_coords_lines = this._cell_coords_by_line(bbox, cell_side, interlace_factor);
  console.log('cell coords by line', cell_coords_lines);
  /* transform the cell coordinates into a data structure of objects of cell coordinates by cell id and by line */
  let ids_coords_lines = this._ids_coords_by_line(cell_coords_lines);
  console.log('ids coords by line', ids_coords_lines);

  /* Query the bin file line by line */
  this.binaries_lines = this._binaries_lines(ids_coords_lines, interlace_factor);
  // console.log('binaries lines', this.binaries_lines);

  let features = [];
  let features_matrix = [];
  return Promise.all(this.binaries_lines).then(function(results) {
    /* each binaries_lines entry is a promise, so we handle them entry by entry */
    /* go row by row,
       these are objects in the form of {2428388552:Uint8Array[...cmpls]} */
    for (let idx=0; idx<cell_coords_lines.length; ++idx) {
      // $.when(this.binaries_lines[idx]).then(function(response, textStatus, jqXHR) {
      // console.log('... results', results, 'arguments', arguments);
      let data = {};
      let row = results[idx]; // 1st row: Uint8Array( [][][][][][][][] )
      let len_cols = Object.keys(row).length; // number of cols in any row (same)
      let first_idx = Object.keys(row)[0]; // bin id of first cell in row
      let len_row = row[first_idx].filter((el, i) => {return i % 2 === 0;}).length;
      let len_matrix = len_cols * len_row; // number of cells in bbox
      let curr_feat_cnt = 0;
      // console.log('index', idx, 'row', row, 'col len', len_cols, 'matrix len', len_matrix);
      features = new Array(len_matrix);

      /* row indices are the binary address ids of the 1st (left) cell in the row */
      for (let row_idx in row) {
        let row_1st_addr_id = parseInt(row_idx);
        /* filter every second array entry, these are the completeness values */
        let row_cmpl_values = row[row_1st_addr_id].filter((el, i) => { return i % 2 === 0;});

        // console.log('row_1st_addr_id', row_1st_addr_id, 'row_cmpl_values', row_cmpl_values);
        /* iterate through each row's cell */
        for (let off_cnt in row_cmpl_values) {
          let offset_count = parseInt(off_cnt);
          let row_cell_addr_id = row_1st_addr_id + offset_count;
          let data_at_addr_id = row_cmpl_values[offset_count];

          data[row_cell_addr_id] = data_at_addr_id; //row[idx][row_1st_addr_id]; //new Uint16Array(row[idx])[0];

          /* 3 bit that code the status */
          let b1 = this._as_Byte8(data_at_addr_id).substring(0,3);

          /* parse into Integer to the base of 2 */
          let completeness = parseInt(b1, 2);
          // console.log(row_cell_addr_id, '==>', data_at_addr_id, 'b1', b1, 'compl', completeness);

          if (completeness in this._feature_style_def) {
            // ...
          } else {
            console.log('when... then ... ', completeness, row_1st_addr_id, b1, ids_coords[row_1st_addr_id]);
            completeness = this.UNKNOWN;
          }

          let coords = ids_coords_lines[idx][0][row_cell_addr_id];
          let feature = {"type":"Feature",
                         "properties":{"completeness": completeness,
                                       "id": row_cell_addr_id},
                         "geometry":{"type":"Polygon",
                                     "coordinates": [coords]
                                    }};

          // console.log(row_cell_addr_id, 'feature', feature, 'coords', coords);
          features[curr_feat_cnt] = feature;
          curr_feat_cnt += 1;
        }
      }

      for (let idx in features) {
        features_matrix.push(features[idx]);
      }
    }

    // console.log('features matrix', features_matrix.slice());
    return features_matrix;
  }.bind(this));

};


/** @param _bbox optional bbox param */
Grid.prototype.draw_grid =  function(_bbox)
{
  // check whether the grid overlay is active in the overlay control
  if (this._application.overlay_added(this._layer_name)) {
    /* we are active */
    console.log('draw grid', this._layer_name, 'layer is active.');
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
    // but we handle this one case here: an inactive grid when the app is reloaded
    if (_bbox === null) { // from draw_grid(null)
      this._draw_grid([0.0,0.0,0.0,0.0]);
    } else {
      // custom event to react to layer added // replace space
      let added_event = 'added_'+(this._layer_name).replace(' ', '_');
      // we moved the map in the meantime, so first unbind the old grid add event
      $(document).unbind(added_event);
      $(document).on(added_event, function(e, bbox) {
        // cast bbox form event handler to floats and draw grid
        bbox = bbox.map(Number);
        console.log('added event received', added_event, bbox);
        this._draw_grid(bbox);
      }.bind(this));
    }
  }
};


/**
   TODO
   - store grid cells in seperate array to avoid querying the binary file on pan
   - Query per whole line instead of per cell
*/
Grid.prototype._draw_grid = function(_bbox)
{
  let bin_length = this.binaries?this.binaries.length:-1;
  if (bin_length > 0) {
    // ...
  }
  console.log('Binaries length', bin_length);
  if (this._layer) {
    console.log('Squares layer exists');
    this._application.remove_layer(this._layer);
  }
  let zoom = this._map_object.map().getZoom();
  // southwest_lng, southwest_lat, northeast_lng, northeast_lat
  let bbox = this._bbox_from_viewport(_bbox);
  // below max zoom
  let below_max_zoom = this._max_zoom - zoom; //
  // number of lines (and possibly columns) to skip, can not be smaller than 1
  let interlace_factor = below_max_zoom>=1?Math.pow(2,below_max_zoom):1;
  console.log('... Using current zoom', zoom, 'maxzoom', this._max_zoom, 'difference', below_max_zoom, 'interlace factor', interlace_factor);

  if (this._max_zoom <= zoom) {
    // the squares grid 'comes' as a promise object, so we have to get it with 'then'
    this.features_grid_from_bbox(bbox, interlace_factor).then(function(result) {
      console.log('... GRID from bbox result', result);
      let poly = {"type":"FeatureCollection",
                  "features":result};
      let squares = L.geoJSON(poly, this._style.layer_style_definition());
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
    }.bind(this));

  } else {

    // this.features_points_from_bbox(bbox, interlace_factor).then(function(result) {
    //   console.log('... POINTS from bbox result', result);
    // }.bind(this));
  }
};


/** Returns a bbox list depending on whether @param bbox is a valid bbox */
Grid.prototype._bbox_from_viewport = function(_bbox)
{
  // TODO check for bbox list validity
  let bbox = _bbox; // option to pass in a bbox
  if (typeof _bbox === 'undefined') { // from draw_grid()
    // the standard behavior is to get the bbox array from the viewport
    bbox = this._map_object.map().getBounds().toBBoxString().split(',').map(Number);
  }
  console.log('... preset Bbox of', _bbox, 'translates to Bbox', bbox);
  return bbox;
};


Grid.prototype.as_JSON = function()
{
  // document.write(JSON.stringify(squares.toGeoJSON()));
  return JSON.stringify(this._squares.toGeoJSON());
};


/** returns the 2nd 8 bit number from 16 bit @param n
    e.g. turns 32 into 0000000 00100000 */
Grid.prototype._as_Byte8 = function(n)
{
  /* to string represented in base 2 */
  return ("000000000" + n.toString(2)).substr(-8);
};


Grid.prototype._on_each_feature = function(feature, layer)
{
  let completeness = feature.properties.completeness;
  let color = this._feature_style_def[completeness];
  let id = feature.properties.id;
  if (this.SHOW_POPUP) {
    layer.bindPopup(this._completeness_categories[completeness], {closeButton: false,
                                                                  autoPan: false,
                                                                  offset: L.point(0, 0)});
  }
  layer.on({
    mouseover: this._feature_highlight.bind(layer, feature, this),
    mouseout: this._feature_reset_highlight.bind(null, this),
    click: this._feature_on_click.bind(this),
  });
  layer.options.fillColor = this._feature_style_def[completeness];
  layer.options.color = this._styling[completeness]['color'];
  layer.options.opacity = this._styling[completeness]['opacity'];
  layer.options.fillOpacity = this._styling[completeness]['fillOpacity'];
  this._layers[id] = layer;
};


/** sets layer highlight style definition to a highlighted appearance
 * @property styledef
 * @property categories
 * @property set_curr_hl
 * @private
 */
Grid.prototype._feature_highlight = function(feature, grid)
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
  if (this.SHOW_POPUP) {
    this._popup.setContent(categories[completeness]);
    this.openPopup();
  }
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
Grid.prototype._set_currently_highlighted = function(id, completeness)
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
Grid.prototype._feature_reset_highlight = function(grid, e)
{
  let set_curr_hl = grid._set_currently_highlighted.bind(grid);
  if (this.SHOW_POPUP) {
    e.target.closePopup();
  }
  // console.log(e.target.feature, c._style_default(e.target.feature));
  e.target.setStyle(grid._style_default(e.target.feature));

  grid._legend_highlight();

  set_curr_hl(null, null);
};


Grid.prototype._legend_highlight = function(completeness, id)
{
  if (typeof completeness === 'undefined') {
    // reset
    $('.'+this._application.ID_PREFIX+'_infolegend_entry').parent().css({"border-color":'#00000000', "border-style": 'solid'});
    $('#'+this._application.ID_PREFIX+'_infolegend_heading').html(-1);
  } else {
    // highlight appropriately
    $('.'+this._application.ID_PREFIX+'_infolegend_entry[data-value="'+completeness+'"]').parent().css({"border-color":this._styling[completeness]['color'], "border-style": 'solid'});
    /* set the currently highlighted id in the legend */
    $('#'+this._application.ID_PREFIX+'_infolegend_heading').html(id);
  }
};

/** passes an event {Object} to the callback function of this layerstyle's style object
 * @private
 * @param {Object} e an event object
 * @throws {} TODO exception handling
 */
Grid.prototype._feature_on_click = function(e)
{
  let completeness = e.target.feature.properties.completeness;
  // TODO check against real completeness from the binary file

  if (this.SHOW_POPUP) {
    e.target._popup.closePopup();
  }
  let id = e.target.feature.properties.id;
  let ids = [id];
  console.log('Click at', ids, 'completeness', completeness);

  // let entry = 0b0001000000000000;
  // FIXME UGLY :(((
  let entry = this.UNKNOWN;
  if (completeness == this.UNKNOWN) {
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
    entry = this.COMPLETE;
  } else {
    entry = this.UNKNOWN;
  }
  let entries = [entry];

  // change completeness on the map tile
  // TODO maybe put that in the set_completeness fn
  e.target.feature.properties.completeness = entry; //completeness==1?0:1;

  /* Set the completeness status on tiles */
  this.set_completeness(ids, entries);
};


/** Sets the completeness on tiles and in the back in the bin file
    @param ids the ids of the tiles and the address of the bin file to be set to a new completeness
    @param entries the new completeness statusses to be set
*/
Grid.prototype.set_completeness = function(ids, entries)
{
  let data = {};
  ids.forEach((key,i) => data[key] = entries[i]);
  console.log('Setting new completeness on', data);
  this._ajax_set_completeness(data);
};


Grid.prototype._binary_cb = function(layer)
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


Grid.prototype.binary_at = function(url, offset, count)
{
  if (typeof count == 'undefined') {
    count = 1;
  }
  // console.log('Fetching', count, 'bytes from offset', offset);
  return $.ajax({
    // url: 'bin/helloworld.bin',
    // url: 'bin/cmpltnss.bin',
    url: url,
    method: 'GET',
    dataType: 'binary',
    processData: false,
    responseType: 'arraybuffer',
    // contentType: "application/octet-stream",
    headers: { 'X-Requested-With': 'XMLHttpRequest',
               Range: "bytes=".concat(2*offset,"-", parseInt(offset)*2+2*count)},
    // Range: "bytes=1-2"},
    success: function(response) {
      // console.log('response', response);
      // data = new Uint16Array(response)[0];
    },
    error: function(xhr, ajaxOptions, thrownError) {
      console.error('error fetching data', thrownError, xhr.status, xhr.responseText, xhr );
    }}).then(
      function(response) {
        // return {offset: response};
        let binary = new Uint8Array(response);
        // console.log('ajax response', binary[0].toString(2), binary[1].toString(2));
        return {[offset]: binary};
      }
    ).fail(
      function(error) {
        console.log(error);
      }
    );
};


/** returns a default style for the vector layer
 * @private
 * @description {color:aColor,dashArray:aNumber,fillColor:aColor,fillOpacity:aNumber[0..1],opacity:aNumber[0..1],weight:aNumber}
 * @param {Object} feature a Leaflet vector layer feature object
 * @returns {Object} a default style for the vector layer
 */
Grid.prototype._style_default = function(feature)
{
  /* pre-set a styling value for the fill color based on the passed in feature parameter */
  var ret = { fillColor: this._feature_color(feature.properties[ this._style.feature_property_name() ]) };
  /* get reference to feature styling object */
  var styledef = this._style.layer_style_definition();
  Object.keys(this._style.layer_style_definition()).forEach(function (key) {
    // console.log(key);
    ret[key] = styledef[key];
  });
  ret['color'] = this._styling[feature.properties.completeness]['color'];
  ret['opacity'] = this._styling[feature.properties.completeness]['opacity'];
  ret['fillOpacity'] = this._styling[feature.properties.completeness]['fillOpacity'];
  return ret;
};

/** feature styling color fetch fn
 * @private
 * @param {String} feature_property a feature property by which the styling of the layer's features is determined
 * @returns {String} a color String
 */
Grid.prototype._feature_color = function(feature_property)
{
  /* set a default feature styling value */
  var ret = '#0000ff';
  /* get reference to feature styling object */
  var styledef = this._style.feature_style_definition();
  /* return feature style based on feature property @param feature_property */
  Object.keys(styledef).forEach(function (key) {
    if (key == feature_property) {ret = styledef[key];}
  });
  return ret;
};


/** http://www.henryalgus.com/reading-binary-files-using-jquery-ajax/ */
Grid.prototype._prepare_ajax_binary = function()
{
  /*  */
  $.ajaxTransport("+binary", function (options, originalOptions, jqXHR) {
    // check for conditions and support for blob / arraybuffer response type
    if (window.FormData && ((options.dataType && (options.dataType == 'binary')) || (options.data && ((window.ArrayBuffer && options.data instanceof ArrayBuffer) || (window.Blob && options.data instanceof Blob))))) {
      return {
        // create new XMLHttpRequest
        send: function (headers, callback) {
          // setup all variables
          var xhr = new XMLHttpRequest(),
              url = options.url,
              type = options.type,
              async = options.async || true,
              // blob or arraybuffer. Default is blob
              dataType = options.responseType || "blob",
              data = options.data || null,
              username = options.username || null,
              password = options.password || null;

          xhr.addEventListener('load', function () {
            var data = {};
            data[options.dataType] = xhr.response;
            // make callback and send data
            callback(xhr.status, xhr.statusText, data, xhr.getAllResponseHeaders());
          });
          xhr.open(type, url, async, username, password);
          // setup custom headers
          for (var i in headers) {
            xhr.setRequestHeader(i, headers[i]);
          }
          xhr.responseType = dataType;
          xhr.send(data);
        },
        abort: function () {
          jqXHR.abort();
        }
      };
    }
  });
};

// var oReq = new XMLHttpRequest();
// oReq.open("GET", 'bin/cmpltnss.bin', true);
// // oReq.open("GET", 'bin/helloworld.bin', true);
// oReq.responseType = 'arraybuffer';
// oReq.onload = function (oEvent) {
//   console.log(oEvent);
//   var arrayBuffer = oReq.response; // Note: not oReq.responseText
//   if (arrayBuffer) {
//     var byteArray = new Uint8Array(arrayBuffer, 1, 3);
//     for (var i = 0; i < byteArray.byteLength; i++) {
//       // for (var i = 0; i < 1; i++) {
//       // do something with each byte in the array
//       console.log(byteArray[i]);
//     }
//   }
// };

// $.ajaxSetup({
//   beforeSend: function (jqXHR, settings) {
//     if (settings.dataType === 'binary') {
//       settings.xhr().responseType = 'arraybuffer';
//     }
//   }
// });
