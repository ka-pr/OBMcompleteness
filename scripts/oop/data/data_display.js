/** class to handle display of {@link Data} objects
 * @constructor
 * @property _header a table header array, see @param header
 * @param {Object} header a table header array to be used when displaying the data as table, e.g. ['GMPE-Name', 'Rank', 'Weight', 'Period']
 **/
function DataDisplay(header = {}, prefix = '')
{
  this._header = header;
  this._prefix = prefix;
}

/** sets or gets the to be displayed data object
 * @param {Data} data a {@link Data} object
 * @returns {Boolean|Data}
 */
DataDisplay.prototype.data = function(data)
{
  if (typeof data === 'undefined') {
    return this._data;
  } else {
    this._data = data;
    return true;
  }
};

/** sets or gets the @param header object
 * @param {Object} header a table header array, see @ctor param header
 * @returns {Boolean|Object}
 */
DataDisplay.prototype.header = function(header)
{
  if (typeof header === 'undefined') {
    return this._header;
  } else {
    this._header = header;
    return true;
  }
};

/** creates an html table string from a data object
 * @param {Data} data a data object containing the to be displayed data
 * @param {Style} style a style object that defines how the data is to be displayed
 * @returns {String} a html table
 */
DataDisplay.prototype.table_from_data = function(data, style)
{
  /* create table & table header objects */
  var table = '',
      table_header = '',
      which = 'zone';
  /* print table head */
  table_header +=  '<thead><tr>';
  /* iterate the table header */
  $.each(this._header, function(_, column_name) {
    table_header += '<th>'+column_name+'</th>';
  });
  table_header += '</tr></thead>';
  /* add the header to the table object */
  table += table_header;
  /* add table body */
  table += '<tbody><tr>';

  $.each(data.data(), function(key, object) {
    /* append a new table section to the wrapper element */
    table_sub_header = '<tr class="'+this._prefix+'_tableheader" style="background-color:'+style.feature_style_definition_rgba(key, 50)+
      '" data-data-sort="'+which+'"'+ '" data-data-key="'+key+'"><th colspan="4">'+key+'</th></tr>';

    /* add a colored (by feature color) subheader to the table */
    table += table_sub_header;
    /** iterate this */
    $.each(object, function(index, entry) {
      /* retrieve array of keys from this iteration's data object
       * do this every iteration, b/c the object's structure might change */
      keys = Object.keys(entry.feature());
      /* start a new row */
      var row_entries = '<tr class="'+this._prefix+'_tablerow"'+' data-data-sort="'+which+'" '+ 'data-data-key="'+key+'"';
      /* add the current data object's features as "data-" html attributes, we need this later
       * when working with the table's data */
      $.each(keys, function(k,v) {
        row_entries += ' data-entry-'+v+'="'+entry.feature(v)+'"';
      });
      row_entries += '">';
      /* iterate over entry feature keys */
      $.each( keys , function(k,v) {
        row_entries += '<td>'+entry.feature(v)+'</td>';
      });
      /* append the built html block */
      table += row_entries + '</tr>';
    });
  });
  return table;
};


/** creates a Leaflet control object that can be put on the map
 * @param {Data} data a data object containing the to be displayed data
 * @param {Style} style a style object that defines how the data is to be displayed
 * @returns {Object} a Leaflet control object
 */
DataDisplay.prototype.infoview = function(data, style, prefix = '')
{
  console.log('... bottom left data:', data, 'style:', style);
  var _info = L.control({
    position : 'bottomleft'
  });
  _info.onAdd = function(map) {
    this._prefix = prefix;
    this._div = L.DomUtil.create('div', 'info listview '+this._prefix+'_legend_whole'); // create a div with a class "info"
    this._div.id = 'info';//divid?divid:""; // from param
    this._div.innerHTML = '<div class="col-xs-12 col-sm-12 col-md-12 col-lg-12"><div id="infoview_content_text" class="row"></div><div id="infoview_content_media" class="row"></div></div>';
    this.update();
    return this._div;
  };
  _info.update = function(key) {
    if ( typeof key === 'undefined' ) { key = ''; }
    if ( typeof data !== 'undefined' && Object.keys(data.data()).length > 0 ) {
      var content = '';
      content += '<div class="'+this._prefix+'_infolegend_parentdiv">'; // parent div
      content += '<div class="'+this._prefix+'_infolegend_innerdiv">';
      /* prepare new table */
      content += '<table id="'+this._prefix+'_data_table" class="table table-striped table-bordered table-hover table-condensed">';
      content += '<thead><tr style="background-color:'+style.feature_style_definition_rgba(key, 50)+'"><th colspan="'+data._feature_keys.length+'" data-data-key="'+key+'">'+
        key+'</th></tr></thead>';
      /* print table head */
      content += '<thead><tr>';
      var table_header = '';
      $.each(data._feature_keys, function(_, column_name) {
        table_header += '<th>'+column_name+'</th>';
      });
      content += table_header;
      // content += '<th>GMPE-Name</th><th>Rank</th><th>Weight</th><th>Period</th>';
      content += '</tr></thead>';
      /* print table body */
      content += '<tbody><tr>';

      // $.each( data.data(key), function( index, group ) {
      $.each(Object.keys(data._data), function( index, group ) {
        var d = data.data(group, key);
        // console.log('... group:', group, 'data:', d);
        if (d) {
          var infoclass = d.selected()?' info': '';
          content += '<tr class="'+this._prefix+'_info_tablerow'+infoclass+'" data-data-sort="infoview" data-data-key="' + key+'" data-entry-GMPE-Name="'+d.feature("GMPE-Name")+'" data-entry-Period="'+d.feature("Period")+'">';
          var table_entries = '';
          $.each(data._feature_keys, function(_, column_name) {
            table_entries += '<td>'+d.feature(column_name)+'</td>';
          });
          content += table_entries;
          content += '</tr>';
        }
      });

      content += '</tr></tbody>';
      content += '</table>';
      content += '<div id="here_used_to_be_media"></div></div></div>';
      // _info._div.innerHTML = content;
      $('#infoview_content_text').html(content);

    } else {
      // clear content
      //this._div.innerHTML = '<h4 id="'+this._prefix+'_info_empty">Locations</h4>' +  (props ? content : 'shows something');
    }
  };
  return _info;
};
