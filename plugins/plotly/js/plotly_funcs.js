/**
 * plots monotonic cubic spline interpolation and EC8 spectral shape graph from DB data
 *
 * see: https://plot.ly/javascript/line-charts/
 * spektraldaten aachen fuer unterschiedliche fraktile
 * TODO: annotation in logarithmic scale not placed properly
 *
 * https://community.plot.ly/t/documentation-on-plotly-hover-and-click-events/833
 * {
 *  points: [{
 *  curveNumber: 2,   // index in data of the trace associated with the selected point
 *  pointNumber: 2,   // index of the selected point
 *  x: 5,             // x value
 *  y: 600,           // y value
 *  data: {...},      // ref to the trace as sent to Plotly.plot associated with the selected point
 *  fullData: {...},  // ref to the trace including all the defaults
 *  xaxis: {...},     // ref to x-axis object (i.e layout.xaxis) associated with the selected point
 *  yaxis: {...}      // ref to y-axis object " "
 * }, {
 *     // similarly for other selected points
 *   }]
 * }
 */

var TITLE_XAXIS = "spectralperiod";
var TITLE_YAXIS = "SA [m/s/s]";
var TITLE_CHART;
var XVALUES;
var YVALUES;
var DATA_VAL_KEY = "spectralperiod";
var DATA, EC8_S=1, EC8_ETA=1;
var ERROR_DISPLAY_GRAPH = "Error displaying graph: no values";
var MONOSPLINE_STEP = 0.005;
var TRACE_ALPHA_LINE = 0.5, TRACE_ALPHA_MARKER = 0.8;
var COLORS = {'fractile84':[255, 0, 0], 'mean':[0, 128, 0], 'median':[0, 0, 255]};

/* prints the json object data into the respective textarea#txt  */
function printdata(data, as)
{
  var txt = document.getElementById('txt');
  var json = JSON.stringify(data);
  var file_ext = '.txt';

  if (as === 'text') {
    txt.value = jsonToCsv(json);
    file_ext = '.csv';
  } else if (as === 'json') {
    txt.value = JSON.stringify(data);
    file_ext = '.json';
  } else {
    //txt.value = JSON.stringify(data);
    txt.value = jsonToCsv(json);
    file_ext = '.csv';

    /* table */
    $('#txt_ec8').append('<table id="gfz_deqhaz16_ec8table" class="table table-bordered table-hover table-condensed">');
    /* print table head */
    $('#gfz_deqhaz16_ec8table').append('<thead><tr>');
    $('#gfz_deqhaz16_ec8table').append('<th>F0</th><th>TB</th><th>TC</th><th>TD</th>');
    $('#gfz_deqhaz16_ec8table').append('</tr></thead>');
    /* print table body */
    $('#gfz_deqhaz16_ec8table').append('<tbody><tr>');
    /* iterate */
    $.each(data.EC8, function(k,v) {
      $('#gfz_deqhaz16_ec8table').append('<tr>'+
                                         '<td><span style="color:rgba('+COLORS[k][0]+','+COLORS[k][1]+','+COLORS[k][2]+','+'0.5)">'+v[0]+'</span></td>'+
                                         '<td><span style="color:rgba('+COLORS[k][0]+','+COLORS[k][1]+','+COLORS[k][2]+','+'0.5)">'+v[1]+'</span></td>'+
                                         '<td><span style="color:rgba('+COLORS[k][0]+','+COLORS[k][1]+','+COLORS[k][2]+','+'0.5)">'+v[2]+'</span></td>'+
                                         '<td><span style="color:rgba('+COLORS[k][0]+','+COLORS[k][1]+','+COLORS[k][2]+','+'0.5)">'+v[3]+'</span></td>'+
                                         '</tr>');
    });
    /* close tags */
    $('#gfz_deqhaz16_ec8table').append('</tr></tbody>');
    $('#gfz_deqhaz16_ec8table').append('</table>');

    /* add the listener only once */
    document.getElementById('download_link').onclick = function(code) {
      $(this).attr('download', 'D-EQHAZ16_lonlat%'+data.lon+'%'+data.lat+'_'+data.returnperiod+file_ext);
      this.href = 'data:text/plain;charset=utf-8,'+ encodeURIComponent(txt.value);
    };
  }

  //$('#select_download').change(function() {
  // JSON to CSV ...
  //});

}

/* plots the json object data into the colorbox div
 * if @param data is empty we replot with last DATA object
 */
function plot(data)
{
  // validity check
  if (data) {
    if (data.error_msg) {
      console.log("plot-data:", data.error_msg);
      document.getElementById('graph').innerHTML = data.error_msg;
      populateDataXY([], [], []);
      return;
    } else {
      console.log("plot-data:", data);
      TITLE_YAXIS =  '$$\\begin{align}\\text{' + res_local.SPECTRAL_RESPONSE_ACC + ' } SRA[\\frac{m}{s^2}]\\end{align}$$';
      TITLE_XAXIS = '$$\\begin{align}\\text{' + res_local.SPECTRAL_PERIOD + ' } T[s]\\end{align}$$';
      TITLE_CHART = data.location+" ("+data.lon+", "+data.lat+") - "+data.returnperiod;
      populateDataXY(data, data.xvalues[DATA_VAL_KEY], data.yvalues);
    }
  } else {
    if (!DATA || DATA.length === 0) {
      document.getElementById('graph').innerHTML = ERROR_DISPLAY_GRAPH;
      return;
    }
  }

  if (XVALUES && YVALUES) {
    var shape = document.getElementById('select_shape').value;
    var xscale = document.getElementById('select_xaxis').value;
    var yscale = document.getElementById('select_yaxis').value;
    var dash = document.getElementById('select_linedash').value;
    var mode = "lines"; // "lines+marker"

    //TITLE_CHART = '$\\frac{m}{s^2}$'; //jax_html_object;
    // render the plot
    var target = createTracesAndPlot(shape, xscale, yscale, dash, mode);
    /* uncommented - hoverinfo is disabled per trace parameter */
    //target.on('plotly_hover', handleOnMouseHover(target));

  } else {
    // no condition applies so display an error
    document.getElementById('graph').innerHTML = ERROR_DISPLAY_GRAPH;
  }
}

/* populates DATA, XVALUES, YVALUES (or empties them) */
function populateDataXY(dataVals, xVals, yVals)
{
  DATA = dataVals;
  XVALUES = xVals;
  YVALUES = yVals;
}

function functionValues(f, args)
{

}

/* creates and returns a new array with step intervals */
function xValues(step)
{
  var xvalues = XVALUES;
  var ret = [];
  for(var i=xvalues[0]; i<xvalues[xvalues.length-1]; i+=step) {
    ret.push(i);
  }
  return ret;
}

function getXValues_Stepped(fractile, step)
{
  return xValues(step);
}

function getXValues_Stepped_EC8(fractile, step)
{
  var ret = xValues(step);
  // clip x values at 3 if TD > 3
  if (DATA.EC8[fractile][3]>3) {
    ret.push(DATA.EC8[fractile][1], DATA.EC8[fractile][2]);
  } else {
    ret.push(DATA.EC8[fractile][1], DATA.EC8[fractile][2], DATA.EC8[fractile][3]);
  }
  ret.sort();
  return ret;
}

/* returns stepped xvalues for the monotonic cubic spline interpolated plot */
function getYValues_Mono(fractile, step)
{
  var ret = [];
  var xvalues = XVALUES;
  var f = createInterpolant(xvalues, YVALUES[fractile]);
  for (var x=xvalues[0]; x<xvalues[xvalues.length-1]; x+=step) {
    ret.push(f(x));
  }
  return ret;
}

/* returns stepped xvalues for the EC8 spectral spectral shape plot */
function getYValues_EC8(fractile, step)
{
  var ret = [];
  var xvalues = XVALUES;
  //xvalues.push(DATA.EC8[fractile][1], DATA.EC8[fractile][2], DATA.EC8[fractile][3]);
  //xvalues.sort();
  var f = createEC8arguments(
    xvalues,
    YVALUES[fractile],
    DATA.pga[fractile], // pga value
    DATA.EC8[fractile][0], // F0
    DATA.EC8[fractile][1], // TB
    DATA.EC8[fractile][2], // TC
    DATA.EC8[fractile][3], // TD
    EC8_S, // S(oil)
    EC8_ETA // Eta (damping)
  );

  var xvals = getXValues_Stepped_EC8(fractile, step);
  for (var i=0; i<xvals.length; ++i) {
    ret.push(f(xvals[i]));
  }
  return ret;
}

/* returns a function(x) that returns EC8 spectral shape argument values */
var createEC8arguments = function(xs, ys, pga, F0, TB, TC, TD, S, Eta)
{
  //console.log(pga, F0, TB, TC, TD, S, Eta);
  var length = xs.length;
  // Deal with length issues
  if (length != ys.length) { throw 'Need an equal count of xs and ys.'; }
  if (length === 0) { return function(x) { return 0; }; }
  if (length === 1) {
    // Impl: Precomputing the result prevents problems if ys is mutated later and allows garbage collection of ys
    // Impl: Unary plus properly converts values to numbers
    var result = +ys[0];
    return function(x) { return result; };
  }

  return function(x) {
    if (F0 === 0) {
      return 0;
    } else if (x<=TB) {
      return pga*S*(1 + x*(Eta*F0-1)/TB);
    } else if (x<=TC) {
      return pga*S*Eta*F0;
    } else if (x<=TD) {
      return pga*S*Eta*F0*TC/x;
    } else {
      return pga*S*Eta*F0*TC*TD/x/x;
    }
  };
};

function getClosest(num, arr)
{
  var mid;
  var lo = 0;
  var hi = arr.length - 1;
  while (hi - lo > 1) {
    mid = Math.floor ((lo + hi) / 2);
    if (arr[mid] < num) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (num - arr[lo] <= arr[hi] - num) {
    return arr[lo];
  }
  return arr[hi];
}

/* prepares the to be plotted curves and calls plotly newplot func*/
function createTracesAndPlot(shape, xscale, yscale, dash, mode)
{
  // create traces to be plotted
  var traces = createTraces(shape, dash, mode); //var traces = [trace1, trace2, trace3];
  var target = document.getElementById('graph');

  /* define plot layout */
  var layout = {
    title: TITLE_CHART,
    showlegend: true,
    hovermode: "closest", // closest: takes only the hovered point
    margin: {
      autoexpand: false,
      l: 100,
      r: 40,
      t: 100
    },
    legend: {
      x: 100,
      y: 1,
      font: {size: 12,
             color: '#555555'
            },
      //traceorder: "reversed",
      //margin: { t: 0 },
      orientation: "v",
      bgcolor: '#FFFFFF',
      bordercolor: '#000000',
      borderwidth: 1
    },
    xaxis: {
      type: xscale,
      autorange: true,
      title: TITLE_XAXIS, //res_local.SPECTRAL_PERIOD + '&nbsp;' + res_local.SPECTRAL_PERIOD_UNIT, //TITLE_XAXIS,
      showticklabels: true,
      autotick: true,
      showline: true,
      showgrid: true,
      tick0: 2,
      ticks: 'inside',
      tickcolor: 'rgb(204,204,204)',
      tickwidth: 2,
      ticklen: 5,
      tickfont: {
        family: 'Arial',
        size: 12,
        color: 'rgb(82, 82, 82)'
      }
    },
    yaxis: {
      type: yscale,
      autorange: true,
      title: TITLE_YAXIS,
      showgrid: true,
      zeroline: false,
      showline: false,
      showticklabels: true
    }/*,
       annotations: [
       {
       xref: 'x',
       yref: 'y',
       x: Math.log10(0.2),
       y: DATA.pga['fractile84'], //DATA.max.mean,
       xanchor: 'left',
       yanchor: 'bottom',
       //arrowhead: 2,
       //arrowsize: 1,
       //arrowwidth: 1,
       text: "PGA",
       font:{
       family: 'Arial',
       size: 12,
       color: 'rgba(255, 0, 0, '+TRACE_ALPHA_MARKER+')' //'rgb(37,37,37)'
       },
       showarrow: true
       }
       ]*/
  };

  Plotly.newPlot( target, traces, layout);

  target.on('plotly_click', function(data){
    console.log('click plot', data);

    var point = data.points[0],
        newAnnotation = {
          x: point.xaxis.d2l(point.x),
          y: point.yaxis.d2l(point.y),
          arrowhead: 6,
          ax: 0,
          ay: -40,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          arrowcolor: point.fullData.marker.color,
          font: {size:12},
          bordercolor: point.fullData.marker.color,
          borderwidth: 2,
          borderpad: 3,
          text: 'T ' + (point.x).toPrecision(1) + ', SRA ' + (point.y).toPrecision(4)
        },
        divid = document.getElementById('graph'),
        newIndex = (divid.layout.annotations || []).length;

    if(newIndex) {
      var foundCopy = false;
      divid.layout.annotations.forEach(function(ann, sameIndex) {
        if(ann.text === newAnnotation.text ) {
          Plotly.relayout('graph', 'annotations[' + sameIndex + ']', 'remove');
          foundCopy = true;
        }
      });
      if(foundCopy) return;
    }

    Plotly.relayout('graph', 'annotations[' + newIndex + ']', newAnnotation)
  });

  return target;
}

/* returns ploa plotly trace array */
function createTraces(shape, dash, mode) {

  /* START monotonic cubic spline or EC8-spectral shape handling */
  var getXValues = function(fractile, step) {
    return XVALUES;
  };
  var getYValues = function(fractile, step) {
    return YVALUES[fractile];
  };

  // change function handle if we are to plot as a monotonic cubic spline
  if (shape == "spline_mono_cubic") {
    shape = "linear";
    step = MONOSPLINE_STEP;
    getXValues = getXValues_Stepped;
    getYValues = getYValues_Mono;
  }

  // change function handle if we are to plot as a monotonic cubic spline
  if (shape == "ec8_spectral_shape") {
    shape = "linear";
    step = MONOSPLINE_STEP;
    getXValues = getXValues_Stepped_EC8;
    getYValues = getYValues_EC8;
  }

  //console.log("XVALUES:", XVALUES);
  //console.log("YVALUES:", getYValues('fractile84'));
  /* END monotonic cubic spline handling  */

  /* curve line based on calculated intermediate points */
  var trace1_line = {
    x: getXValues('fractile84', step),
    y: getYValues('fractile84', step),
    hoverinfo: "skip",
    legendgroup: "trace1",
    line: {
      shape: shape,
      dash: dash,
      color: 'rgba('+COLORS.fractile84[0]+', '+COLORS.fractile84[1]+', '+COLORS.fractile84[2]+', '+TRACE_ALPHA_LINE+')'
    },
    mode: mode,
    name: res_local.PRCT84,
    type: "scatter"
  },
      /* markers based on points from the database */
      trace1_marker = {
        x: XVALUES,
        y: YVALUES.fractile84,
        legendgroup: "trace1",
        showlegend: false,
        line: {
          shape: shape,
          dash: dash,
          color: 'rgba('+COLORS.fractile84[0]+', '+COLORS.fractile84[1]+', '+COLORS.fractile84[2]+', '+TRACE_ALPHA_MARKER+')'
        },
        mode: "markers",
        name: "84% fractile",
        type: "scatter",
        marker:{color:'rgba(180, 0, 0, .8)',
                size:8}
      };


  var trace2_line = {
    x: getXValues('mean', step),
    y: getYValues('mean', step),
    hoverinfo: "skip",
    legendgroup: "trace2",
    line: {
      shape: shape,
      dash: dash,
      color: 'rgba('+COLORS.mean[0]+', '+COLORS.mean[1]+', '+COLORS.mean[2]+', '+TRACE_ALPHA_LINE+')'
    },
    mode: mode,
    name: res_local.MEAN,
    type: "scatter"
  },
      trace2_marker = {
        x: XVALUES,
        y: YVALUES.mean,
        legendgroup: "trace2",
        showlegend: false,
        line: {
          shape: shape,
          dash: dash,
          color: 'rgba('+COLORS.mean[0]+', '+COLORS.mean[1]+', '+COLORS.mean[2]+', '+TRACE_ALPHA_MARKER+')'
        },
        mode: "markers",
        name: "mean",
        type: "scatter",
        marker:{color:'rgba(0, 180, 0, .8)',
                size:8}
      };

  var trace3_line = {
    x: getXValues('median', step),
    y: getYValues('median', step),
    hoverinfo: "skip",
    legendgroup: "trace3",
    line: {
      shape: shape,
      dash: dash,
      color: 'rgba('+COLORS.median[0]+', '+COLORS.median[1]+', '+COLORS.median[2]+', '+TRACE_ALPHA_LINE+')'
    },
    mode: mode,
    name: res_local.MEDIAN,
    type: "scatter"
  },
      trace3_marker = {
        x: XVALUES,
        y: YVALUES.median,
        legendgroup: "trace3",
        showlegend: false,
        line: {
          shape: shape,
          dash: dash,
          color: 'rgba('+COLORS.median[0]+', '+COLORS.median[1]+', '+COLORS.median[2]+', '+TRACE_ALPHA_MARKER+')'
        },
        mode: "markers",
        name: "median",
        type: "scatter",
        marker:{color:'rgba(0, 0, 180, .8)',
                size:8}
      };

  return [trace1_marker, trace1_line, trace2_line, trace2_marker, trace3_line, trace3_marker];
}

/* IIFE function mouse-hover event callback handler  */
function handleOnMouseHover(target)
{
  /* returns a function that reduces point highlighting when hovering to the initial data layer
   * and skips calculated in-between points
   */
  return function (eventdata)
  {
    console.log("Event data: ", eventdata);
    console.log(eventdata.points[0].fullData.x);
    var points = eventdata.points[0],
        pointNum = points.pointNumber;
    //console.log("hovering over x "+points.x);
    var x = Math.round(points.x*1000)/1000;
    if (XVALUES.indexOf(x) != -1) {
      console.log("found "+x+" at pos "+XVALUES.indexOf(x));
    } else {
      var xclosest = getClosest(x, XVALUES);
      console.log("found "+x+" to be closest to "+xclosest+" at pos "+XVALUES.indexOf(xclosest));
      pointNum = eventdata.points[0].fullData.x.indexOf(xclosest);
    }
    Plotly.Fx.hover(target,[
      { curveNumber:0, pointNumber:pointNum },
      { curveNumber:1, pointNumber:pointNum },
      { curveNumber:2, pointNumber:pointNum },
      { curveNumber:3, pointNumber:pointNum },
    ]);
  };
}

/* Monotone cubic spline interpolation
   see: https://en.wikipedia.org/wiki/Monotone_cubic_interpolation
   Usage example:
   var f = createInterpolant([0, 1, 2, 3, 4], [0, 1, 4, 9, 16]);
   var message = '';
   for (var x = 0; x <= 4; x += 0.5) {
   var xSquared = f(x);
   message += x + ' squared is about ' + xSquared + '\n';

   }
   alert(message);
*/
var createInterpolant = function(xs, ys)
{
  var i, length = xs.length;
  // Deal with length issues
  if (length != ys.length) { throw 'Need an equal count of xs and ys.'; }
  if (length === 0) { return function(x) { return 0; }; }
  if (length === 1) {
    // Impl: Precomputing the result prevents problems if ys is mutated later and allows garbage collection of ys
    // Impl: Unary plus properly converts values to numbers
    var result = +ys[0];
    return function(x) { return result; };
  }

  // Rearrange xs and ys so that xs is sorted
  var indexes = [];
  for (i = 0; i < length; i++) { indexes.push(i); }
  indexes.sort(function(a, b) { return xs[a] < xs[b] ? -1 : 1; });
  var oldXs = xs, oldYs = ys;
  // Impl: Creating new arrays also prevents problems if the input arrays are mutated later
  xs = []; ys = [];
  // Impl: Unary plus properly converts values to numbers
  for (i = 0; i < length; i++) { xs.push(+oldXs[indexes[i]]); ys.push(+oldYs[indexes[i]]); }

  // Get consecutive differences and slopes
  var dys = [], dxs = [], ms = [];
  for (i = 0; i < length - 1; i++) {
    var dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
    dxs.push(dx); dys.push(dy); ms.push(dy/dx);

  }


  // Get degree-1 coefficients
  var c1s = [ms[0]];
  for (i = 0; i < dxs.length - 1; i++) {
    var m = ms[i], mNext = ms[i + 1];
    if (m*mNext <= 0) {
      c1s.push(0);

    } else {
      var dx_ = dxs[i], dxNext = dxs[i + 1], common = dx_ + dxNext;
      c1s.push(3*common/((common + dxNext)/m + (common + dx_)/mNext));

    }

  }
  c1s.push(ms[ms.length - 1]);

  // Get degree-2 and degree-3 coefficients
  var c2s = [], c3s = [];
  for (i = 0; i < c1s.length - 1; i++) {
    var c1 = c1s[i], m_ = ms[i], invDx = 1/dxs[i], common_ = c1 + c1s[i + 1] - m_ - m_;
    c2s.push((m_ - c1 - common_)*invDx); c3s.push(common_*invDx*invDx);

  }

  // Return interpolant function
  return function(x) {
    // The rightmost point in the dataset should give an exact result
    var i = xs.length - 1;
    if (x == xs[i]) { return ys[i]; }

    // Search for the interval x is in, returning the corresponding y if x is one of the original xs
    var low = 0, mid, high = c3s.length - 1;
    while (low <= high) {
      mid = Math.floor(0.5*(low + high));
      var xHere = xs[mid];
      if (xHere < x) { low = mid + 1; }
      else if (xHere > x) { high = mid - 1; }
      else { return ys[mid]; }

    }
    i = Math.max(0, high);

    // Interpolate
    var diff = x - xs[i], diffSq = diff*diff;
    return ys[i] + c1s[i]*diff + c2s[i]*diffSq + c3s[i]*diff*diffSq;

  };
};
