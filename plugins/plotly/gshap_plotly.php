<?php
/* POST'ed
   fetches a coordinate's spectral data from the DB
   and plots it via plotly
*/

/* config file */
#require_once dirname( __FILE__ ) . '/../../config/config.php';
require_once '../../config/config.php';

include_once JSONUTIL_FILE_PATH;

if (DEBUG) {
    include_once '../../php_other/my_error_handler.php';
    $old_error_handler = set_error_handler("myErrorHandler");
    //trigger_error("test the trigger", E_USER_ERROR);
}

?>

<html xmlns="http://www.w3.org/1999/xhtml" style="height:100%">
    <head>
    <title>GSHAP Plot</title>
    <meta content="text/html;charset=utf-8" http-equiv="Content-Type">
    <meta content="utf-8" http-equiv="encoding">
    <link rel="stylesheet" href="styles/plottingbox.css">
    <script>
    /* plot spectral data when this page is loaded */
     <?php
                   echo "data_json = " . getSpectralDataJSON($_GET) . ";";
     ?>
     $( document ).ready(function() {
         plot(data_json);
         /* print raw data in respective form */
         printdata(data_json/*, 'text'*/);
         /* re-render the bootstrap-select */
         $('.selectpicker').selectpicker('render');
     });

    </script>
  </head>

  <body onload="">
      <div id="graph" style="width:800px;height:450px;"></div>

      <div class="container horizontal">

          <div class="row">
              <!-- print out data area -->
              <div class="gfz_deqhaz16_seperator"></div>
              <div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
                  <div id="txt_ec8">

                  </div>
              </div>
          </div>

          <div id="wrapper_graphoptions" class="row">
              <!-- manipulate graph area -->
              <div class="gfz_deqhaz16_seperator"></div>
              <div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
                  <form action="">
                      <!-- value-local="PAGE_TITLE" -->
                      <select id="select_shape" class="selectpicker" name="select_shape" size="1" onchange="plot();" data-header="select a shape" >
                          <script>
                           $('#select_shape').data('header', res_local.SELECT_SHAPE_HEADER);
                           $('#select_shape').append('<option class="tooltip-anchor" title="<b>'+res_local.SHAPE+'</b> '+res_local.MONOTONE_CUBIC_SPLINE_INT+'" value="spline_mono_cubic" selected="selected">'+res_local.MONOTONE_CUBIC_SPLINE_INT_TT+'</option>');
                           $('#select_shape').append('<option class="tooltip-anchor" title="<b>'+res_local.SHAPE+'</b> '+res_local.EC8_SPECTRAL_SHAPE+'" value="ec8_spectral_shape">'+res_local.EC8_SPECTRAL_SHAPE_TT+'</option>');
                          </script>
                      </select>
                  </form>
              </div>
              <div class="col-xs-6 col-sm-6 col-md-6 col-lg-6">
                  <form action="">
                      <select id="select_xaxis" class="selectpicker" name="select_xaxis" size="1" onchange="plot();" data-header="select xaxis scale">
                          <script>
                           $('#select_xaxis').data('header', res_local.SELECT_XAXIS_HEADER);
                           $('#select_xaxis').append('<option class="tooltip-anchor" title="<b>'+res_local.XAXIS+'</b> '+res_local.LOG10+'" value="log" selected="selected">'+res_local.LOG10_TT+'</option>');
                           $('#select_xaxis').append('<option class="tooltip-anchor" title="<b>'+res_local.XAXIS+'</b> '+res_local.LINEAR+'" value="lin">'+res_local.LINEAR_TT+'</option>');
                          </script>
                      </select>
                  </form>
              </div>
              <div class="col-xs-6 col-sm-6 col-md-6 col-lg-6">
                  <form action="">
                      <select id="select_yaxis" class="selectpicker" name="select_yaxis" size="1" onchange="plot();" data-header="select yaxis scale">
                          <script>
                           $('#select_yaxis').data('header', res_local.SELECT_YAXIS_HEADER);
                           $('#select_yaxis').append('<option class="tooltip-anchor" title="<b>'+res_local.YAXIS+'</b> '+res_local.LOG10+'" value="log">'+res_local.LOG10_TT+'</option>');
                           $('#select_yaxis').append('<option class="tooltip-anchor" title="<b>'+res_local.YAXIS+'</b> '+res_local.LINEAR+'" value="lin" selected="selected">'+res_local.LINEAR_TT+'</option>');
                          </script>
                      </select>
                  </form>
              </div>
              <div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
                  <form action="">
                      <select id="select_linedash" class="selectpicker" name="select_linedash" size="1" onchange="plot();" data-header="select line dash">
                          <script>
                           $('#select_linedash').data('header', res_local.SELECT_LINEDASH_HEADER);
                           $('#select_linedash').append('<option class="tooltip-anchor" title="<b>'+res_local.LINEDASH+'</b> '+res_local.LINE_DASH_SOLID+'" value="solid" selected="selected">'+res_local.LINE_DASH_SOLID+'</option>');
                           $('#select_linedash').append('<option class="tooltip-anchor" title="<b>'+res_local.LINEDASH+'</b> '+res_local.LINE_DASH_DASHDOT+'" value="dashdot">'+res_local.LINE_DASH_DASHDOT+'</option>');
                           $('#select_linedash').append('<option class="tooltip-anchor" title="<b>'+res_local.LINEDASH+'</b> '+res_local.DOT+'" value="dot">'+res_local.LINE_DASH_DOT+'</option>');
                          </script>
                      </select>
                  </form>
              </div>
          </div>

          <!-- data download area -->
          <div id="wrapper_download" class="row">
              <div class="gfz_deqhaz16_seperator"></div>
              <div class="col-xs-4 col-sm-4 col-md-4 col-lg-4" id="wrapper_txt">
                  <form action="">
                      <label>
                          <a href="" id="download_link" download="">
                              <script>
                               $('#download_link').append('<span>'+res_local.DOWNLOAD_AS+'</span>');
                              </script>
                          </a>:
                          <select id="select_download" class="selectpicker" name="select_download" size="1" onchange="printdata(data_json, this.value);" data-header="select download format">
                              <script>
                               $('#select_download').data('header', res_local.SELECT_DOWNLOADAS_HEADER);
                              </script>
                              <option value="json">JSON</option>
                              <option value="text" selected="selected">Text/CSV</option>
                          </select>
                      </label>
                  </form>
              </div>
              <div class="col-xs-8 col-sm-8 col-md-8 col-lg-8" id="wrapper_txt">
                  <textarea class="form-control custom-control" id="txt" style=""></textarea>
              </div>
          </div>
      </div>



  </body>

</html>



