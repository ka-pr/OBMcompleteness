#!/usr/bin/python
# -*- coding: UTF-8 -*-# enable debugging

import logging, argparse
from decimal import Decimal
import numpy as np
import sys, os
import json
# insert at 1, 0 is the script path (or '' in REPL)
# sys.path.remove('/home/prehn/git/completeness/cgi-bin')
# sys.path.remove('/home/prehn/git/completeness/py')

py_script_path = '/home/prehn/git/completeness/py'
if not py_script_path in sys.path:
    sys.path.insert(1, py_script_path)
else:
    print sys.path
    pass
import importlib
ln_grid_wsgi = 'grid_wsgi' #input('Enter module name:')
grid_wsgi = importlib.import_module(ln_grid_wsgi)

if '__file__' not in globals():
    binfile = '/home/prehn/git/completeness/bin/cmpltnss.bin~'
else:
    binfile = os.path.join(os.path.dirname(__file__), '../bin/cmpltnss.bin')

cell_frac_denominator = Decimal(360.0) # cells per degree along horizontal and vertical axis


def id2coords(_id, cell_frac_denominator):
    cell_size = Decimal(1.0)/cell_frac_denominator
    cells_to_right = _id % 129600
    cells_down = _id / 129600
    lat_bottom = 90-cells_down * cell_size # Lat3 BOTTOM left corner
    lon_left = cells_to_right * cell_size - 180.0 # Lon3 bottom LEFT corner
    lat_top = lat_bottom + cell_size
    lon_right = lon_left + cell_size
    coords = [[lon_left,lat_top],[lon_right,lat_top],[lon_right,lat_bottom],[lon_left,lat_bottom],[lon_left,lat_top]]
    return coords


def coords2id(coords, cell_frac_denominator):
    cells_per_deg = cell_frac_denominator
    y = Decimal(90.0)-coords[3][1] # y id running from north to south
    x = coords[0][0] + Decimal(180.0) # x id running from -180 Deg to +180 Deg
    y_coord = cells_per_deg*y # 360.0*y
    x_coord = cells_per_deg*x # 360.0*x
    _id = Decimal(129600.0) * y_coord + x_coord
    return _id


def adjust_bbox2grid(bbox, cell_frac_denominator):
    cell_size = Decimal(1.0)/cell_frac_denominator
    bbox[0] = bbox[0] - ((bbox[0]+Decimal(180.0)) % cell_size)
    bbox[1] = bbox[1] - (bbox[1] % cell_size)
    bbox[2] = bbox[2] + (cell_size - (bbox[2]+Decimal(180.0)) % cell_size)
    bbox[3] = bbox[3] + (cell_size - bbox[3] % cell_size)
    return bbox



def drange(start, stop, step):
    r = start
    while r <= stop:
        yield r
        r += step


def feature_cell_NWcorner(lons, lats):
    """ lon, lat upper left cell corner"""
    return [[(lon, lat) for lat in lats] for lon in lons]



def leftcell_cellcounter_dataview(features_NWcorner, cell_frac_denominator):
    cell_size = Decimal(1.0)/cell_frac_denominator
    lons = features_NWcorner[:,:,0]
    lats = features_NWcorner[:,:,1]
    lefts = lons + cell_size # left edge coordinates
    bottoms = lats - cell_size # bottom edge coordinates
    line_len = features_NWcorner.shape[0]
    col_len = features_NWcorner.shape[1]

    ids_coords_columns = [-1] * line_len # init list
    # go by column
    for i, _ in enumerate(lons):
        cells_to_right = line_len - i # cells to the right of this cell, including this cell
        # cell coordinates of this column
        coords = np.array( zip(zip(lons[i],lats[i]), zip(lefts[i],lats[i]), zip(lefts[i],bottoms[i]), zip(lons[i],bottoms[i]), zip(lons[i],lats[i])) )
        coords_float = [[(float(round(c[0],8)), float(round(c[1],8))) for c in cell] for cell in coords ]
        # respective cell ids of this column
        ids = [coords2id(c, cell_frac_denominator) for c in coords]
        ids_int = [int(round(id,0)) for id in ids] # I think these are the correct id value

        ids_coords_columns[i] = ( {id_coords[0]:{'coordinates':id_coords[1], 'id':id_coords[0], 'cells2right':cells_to_right} for id_coords in zip(ids_int, coords_float)} )


    return ids_coords_columns



if __name__ == "__main__":
    """ Creates a geojson file from the completeness binary file """
    logging.basicConfig()
    log = logging.getLogger('Completeness')

    parser = argparse.ArgumentParser()
    # required arguments
    parser.add_argument("bbox", help="bbox of area to create output from")
    # optional arguments
    parser.add_argument("--o", help="output file location")

    args = parser.parse_args()

    bbox = [0.0,0.0,0.0,0.0]
    try:
        bbox_flt = [float(b) for b in  args.bbox.split(',')]
        bbox = [Decimal(b) for b in bbox_flt]
    except:
        log.exception('Error parsing bbox. {}'.format(parser.print_help()))
        exit(0)

    """ adjust the bbox to match grid line """
    bbox = adjust_bbox2grid(bbox, cell_frac_denominator)
    """ line cells """
    line_cells = [lon for lon in drange(bbox[0], bbox[2], Decimal(1.0)/cell_frac_denominator)]
    """ cell count to the right including first cell """
    line_cell_count = len(line_cells)
    """ xxx """
    lats = np.array([lat for lat in drange(bbox[1], bbox[3], Decimal(1.0)/cell_frac_denominator)][::-1]) # reversed list of latitudes
    lons = np.array([lon for lon in drange(bbox[0], bbox[2], Decimal(1.0)/cell_frac_denominator)])
    """ xxx """
    features_NWcorner = np.array(feature_cell_NWcorner(lons, lats))
    log.info('Working with grid of dimension {}'.format(features_NWcorner.shape))
    """ xxx """
    ids_coords_columns = leftcell_cellcounter_dataview(features_NWcorner, cell_frac_denominator)
    """ list of form key = most west cell, value = number of cells to the east """
    data = {id:val['cells2right'] for id,val in ids_coords_columns[0].iteritems()}

    """ binary reader """
    binary_reader = grid_wsgi.BinaryReader()
    cmpl_json = binary_reader.read_binary(binfile, data)

    outfile = args.o
    if outfile is not None:
        try:
            with open(outfile, 'w') as of:
                json.dump(cmpl_json, of)
        except:
            log.warning('args {}'.format(args))
            log.exception('Error dumping request to {}'.format(args.o))
            exit(0)
    else:
        print cmpl_json







