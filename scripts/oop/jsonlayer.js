/** JSON layer wrapper class
 * <pre>inherits from {@link Layer}
 * <pre>wrapper class for Leaflet geojson layer objects
 * retrieves json geo data from a url, wraps a jQuery getJSON fn call around a leaflet geoJson fn call
 * the result is passed to the map class object via a callback fn
 * @constructor
 * @param {String} description the description of the layer as it is displayed in the map control widget
 * @param {String} url the URL where json file is to be found
 * @param {Function} callback function to call when the json data has been fetched
 * @param {Style} [style] a style parameter object
 */
function JsonLayer(description, url, callback, style, ignore_keys=[])
{
  /* handle style object non empty */
  if (typeof style === 'undefined') { style = new Style();}
  //style = this._default_params_object();
  this._ignore_keys = ignore_keys;
  /* call parent ctrs to store passed in params */
  this.Layer_ctr.call(this, description, url, callback, style);
  this.LayerStyle_ctr.call(this, style);
  /* this wrapped layer object
   * see: http://api.jquery.com/jquery.getjson/ */
  /* TODO this doesn't work with zip files (-> fail), and yet it does work regardless. don't know why */
  jqxhr = $.getJSON(url, function(data) {
    // console.log('... new json layer', data, this);
  });
  /* bind this context to the anonymous fn call */
  jqxhr.done(function(data) {
    this._L_geoJson(data, this._default_params_object(), style);
  }.bind(this))
  /* TODO fail cb */
    .fail(function(e) {
      console.log("error fetching json data", e);
    });
}

/** inherit from @class Layer */
JsonLayer.prototype = Object.create(Layer.prototype);
/** get reference to parent ctors  */
JsonLayer.prototype.Layer_ctr = Layer;
JsonLayer.prototype.LayerStyle_ctr = LayerStyle;

/** multi inherit
 * @mixin {@link JsonLayer} multi inherits from {@link Layer} and {@link LayerStyle}
 * so it copies over {@link LayerStyle}'s protoype members
 */
void function mixin_parent() {
  var keys = Object.keys(LayerStyle.prototype);
  var i, len;
  for(i = 0, len = keys.length; i < len; ++i) {
    JsonLayer.prototype[keys[i]] = LayerStyle.prototype[keys[i]];
  }
}();


/** returns the feature keys of this layer
 * @returns {?} feature keys
 */
JsonLayer.prototype.feature_keys = function(added)
{
  if (typeof added === 'undefined') {
    return this._features;
  } else {
    // this._added = added;
    return true;
  }
};

/**
 * wrapper fn for leaflet @function geoJSON
 * TODO pass in property param object
 * @param {Json} data_json json data object
 * @param  {<GeoJSON options>} options object in GEOJson format to display on the map, @see http://leafletjs.com/reference-1.3.0.html#geojson-option
 * @param {Style} style a style parameter object
 * @private
 */
JsonLayer.prototype._L_geoJson = function(data_json, options, style)
{
  /* async fetch done! */
  // style = this._default_params_object();
  /* init a leaflet geojson object */
  var json = L.geoJSON(data_json, options);// {'color':'#e4808c'});//this.parameter());
  /* add the leaflet geoJson response as layer to this object */
  this._layer = json;
  /* parse this layers features (key values) / data */
  var feature_keys = [];
  var data = new Data();
  var ignore_keys = this._ignore_keys;
  var polygons = {};
  $.each(this._layer._layers, function(index, layer) {
    var features = {};
    $.each(layer.feature.properties, function(key, value) {
      if ($.inArray(key, ignore_keys)!==-1) {
        return true;
      }
      if (value) {
        if ($.inArray(key, feature_keys)===-1) {
          feature_keys.push(key);
        }
        features[key] = value;
      }
    });
    this._layer._layers[index]._features = features;
    /* data object */
    var entry = new Entry(features);
    this._layer._layers[index]._data_entry = entry;
    // wir muessen hier die property wissen, nach der die map eingefaerbt wird, damit wir das in Zeile 101 verwenden koennen
    // console.log('... style feature property name', style._feature_property_name);
    /* add a new data entry */
    data.data(style._feature_property_name /*index*/, entry._properties[style._feature_property_name], entry);
    /* also store the feature vector polygons as a list of highlight features */
    polygons[layer._features[style._feature_property_name]] = layer;
  }.bind(this));
  this._data = data;
  this._data._feature_keys = feature_keys;
  this._data._polygons = polygons;

  /* invoke the callback function and return this JsonLayer object to the map object */
  if (this.json_fetched_cb && typeof this.json_fetched_cb === "function") {
    console.log('... json layer creation done, calling back to map object', this);
    /* callback to @fn map::_json_callback_fn */
    this.json_fetched_cb(this);
  } else {
    // TODO throw error - see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw
  }
};

