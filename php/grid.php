<?php
/** POST'ed */

// include_scripts();

if(isset($_POST['id']) && !empty($_POST['id'])) {
    $id = $_POST['id'];
    $data = $_POST['data'];

    // $fp = fopen('../bin/cmpltnss.bin', 'rb+');
    // fseek($fp, $id);

    /* init db & access */
    // $db = new Database('GMPE');
    // switch($action) {
    // case 'gmpe' : mock_data_query_gmpe($db);break;
    // }

    // echo $data[0];
    echo phpinfo();
}