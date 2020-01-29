
function Plot()
{

};

Plot.prototype.plot = function(file_name = false, plot_title = 'plot')
{
  if (!file_name) {
    /* https://plot.ly/javascript/plotlyjs-function-reference/#plotlyrelayout
     * an efficient means of updating both the data array and layout object in an existing plot, basically a combination of Plotly.restyle and Plotly.relayout */
    // Plotly.redraw('media');

    // return true;
  } else {

    console.log('... plotting:', plot_title, file_name);
    var data_matrix = [];
    var x = [], x_column = 0;
    var y1 = [], y1_column = 1;
    var y2 = [], y2_column = 2;
    // var date_regexp = "^(0[1-9]|1[012])[- /.](0[1-9]|[12][0-9]|3[01])[- /.](19|20)\\d\\d$";
    $.get(file_name, function(d){
      var lines = d.split(/\r\n|\n/);
      // var heading = lines[0].split(' ');
      $.each(lines, function(_, line) {
        // console.log('... line:', line);
        var larr = line.split(' ');
        var row = [];
        for (i=0; i<larr.length; ++i) {
          var entry = larr[i];
          if (i===0) {
            var date = larr[i].replace('T', ' ').replace('Z', '');
            entry = Date.parse(date);
            entry = date;
          };
          row.push(entry);
        }
        data_matrix.push(row);
      });
    })
      .done(function() {
        $.map(data_matrix, function(vector) {
          // console.log('... vector', vector);
          x.push(vector[x_column]);
          y1.push(vector[y1_column]);
          y2.push(vector[y2_column]);
        });
        console.log('... data from file:', x, y1, y2);

        var trace1 = {
          x: x,
          y: y1,
          type: 'scatter',
          name: 'ways',
          legendgroup: 'trace1'
        };
        var trace2 = {
          x: x,
          y: y2,
          yaxis: 'y2',
          type: 'scatter',
          name: 'relations',
          legendgroup: 'trace2'
        };

        /* define plot layout */
        var layout = {
          title: plot_title,
          showlegend: true,
          hovermode: "closest", // closest: takes only the hovered point
          margin: {
            autoexpand: false,
            l: 100,
            r: 40,
            t: 100
          },
          legend: {
            x: 0.25,
            y: 0.75,
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
            type: true,
            autorange: true,
            title: 'year',
            showticklabels: true,
            autotick: true,
            showline: false,
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
            type: true,
            autorange: true,
            title: 'ways',
            showgrid: true,
            zeroline: false,
            showline: false,
            showticklabels: true
          },
          yaxis2: {
            title: 'relations',
            titlefont: {color: 'rgb(148, 103, 189)'},
            tickfont: {color: 'rgb(148, 103, 189)'},
            overlaying: 'y',
            side: 'right'
          }
        };

        Plotly.newPlot('infoview_content_media', [trace1, trace2], layout);
      });
  }
};
