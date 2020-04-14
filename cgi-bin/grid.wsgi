#!/usr/bin/python
# -*- coding: UTF-8 -*-# enable debugging

import logging, json
# from wsgiref.simple_server import make_server
# from urlparse import parse_qs
from cgi import escape
import StringIO as io
import os, struct
import psycopg2, re
from pygeotile.tile import Tile
from pygeotile.point import Point
from shapely import wkb
from shapely.geometry import box, shape, mapping

# BINFILE = os.path.join('/home/prehn/git/completeness', 'bin/cmpltnss.bin')
BINFILE = os.path.join('/home/prehn/git/OBMcompleteness', 'bin/cmpltnss.bin')
db_name = 'obm_cmpl'
table_name = 'cmpl_grid'
zoom = 17
srid = 4326
lose_no_information_cmpl = [0, 4, 5, 6]
other_quadrants  = {'0':['1','2','3'], '1':['0','2','3'], '2':['0','1','3'], '3':['0','1','2']}

def application(environ, start_response):
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        # formatter = logging.Formatter('%(asctime)s: %(levelname)-8s <[%(filename)s]> ...: %(message)s', datefmt='%Y.%m.%d %H:%M:%S')
        formatter = logging.Formatter('<[%(levelname)s: %(filename)s]> ...: %(message)s')
        consoleHandler = logging.StreamHandler()
        consoleHandler.setFormatter(formatter)
        logger.addHandler(consoleHandler)

    # the binary is of 16 GB size
    # each cell is Int16 => 2 x 8 Bit = 16 bit
    # 360 x 360 x 180 x 360 cells => ~8.4 10^9 cells
    # binfile = os.path.join(os.path.dirname(__file__), '../bin/cmpltnss.bin')

    cell_size = 10.0/60.0**2 # in degree, 0.002777777777777778

    # the environment variable CONTENT_LENGTH may be empty or missing
    try:
        request_body_size = int(environ.get('CONTENT_LENGTH', 0))
    except (ValueError):
        request_body_size = 0
    logger.debug('Request body size: {}'.format(request_body_size))

    # When the method is POST the variable will be sent
    # in the HTTP request body which is passed by the WSGI server
    # in the file like wsgi.input environment variable.
    request_body = environ['wsgi.input'].read(request_body_size)
    d = json.loads(request_body) #parse_qs(request_body)
    action = d['action'] # set or get
    response = {}

    if action == 'set':
        logger.debug('Request body content: {}'.format(','.join('id [{}]: {:03b}'.format(k,v) for k,v in d['cells'].iteritems())))

        logger.debug('Working in directory: {}'.format(os.path.dirname(__file__)))
        # entries = [entry for entry in d.get('entries', [''])]
        # positions = [pos for pos in d.get('positions', ['-1'])]
        data = {}
        for k, v in d['cells'].iteritems():
            data[escape('{}'.format(k))] = v

        # logger.debug('Positions: {}, entries: {}'. format(positions, entries))

        # binfile = os.path.join(os.path.dirname(__file__), '../bin/helloworld.bin')
        binary_writer = BinaryWriter(logger=logger)
        binary_writer.write_binary(BINFILE, data)

        status = b'200 OK'
        # response = json.dumps({'entries': entries, 'positions': positions})
        response = json.dumps(data)
        response_headers = [('Content-type', 'application/json'),
                            ('Content-Length', str(len(response)))
        ]
        start_response(status, response_headers)
        return response

    elif action == 'get':
        binary_reader = BinaryReader(cellsize=cell_size, logger=logger)
        data = binary_reader.read_binary(BINFILE, d['cells']) # completeness matrix

        status = b'200 OK'
        logger.debug('Done. Status {}'.format(status))
        response = json.dumps(data)
        response_headers = [('Content-type', 'text/plain'),
                            ('Content-Disposition', 'attachment; filename="my_grid.txt"'),
                            ('Content-Length', str(len(response))),
        ]

        f = io.StringIO(response)

        start_response(status, response_headers)

        if 'wsgi.file_wrapper' in environ:
            logger.debug('... 1')
            return environ['wsgi.file_wrapper'](f, 1024)
        else:
            logger.debug('... 2')
            return iter(lambda: f.read(4096), '')

    elif action == 'quad_get':
        bbox = d['bbox']
        quad_grid_builder = QuadGridBuilder(logger=logger)
        quad_grid = quad_grid_builder.quadgrid_from_bbox(bbox)
        logger.debug('Quad grids for BBOX {}'.format(bbox))

        status = b'200 OK'
        response = json.dumps(quad_grid)
        response_headers = [('Content-type', 'application/json'),
                            ('Content-Length', str(len(response)))
        ]
        start_response(status, response_headers)
        return response

    elif action == 'quad_set':
        data = d['data']
        len_data = len(data)
        quad_grid_builder = QuadGridBuilder(logger=logger)
        logger.debug('Received new tile data {}.'.format(data))

        for cnt, qk in enumerate(data, 1):
            cmpl = data[qk]
            quad_start_leafs = quad_grid_builder.same_quadrant_leafs(qk)
            logger.debug('[{}/{}: {}.QL:{}] START assembling data changes with: new completeness {}, complementary leafs {}'.format(cnt, len_data, qk, len(qk), cmpl, quad_start_leafs))
            upsert_and_remove_data = quad_grid_builder.upsert_quad_leafs(quad_start_leafs, quad_start=qk)
            logger.debug('[{}/{}] Executing changes to the DB: {}.'.format(cnt, len_data, upsert_and_remove_data))
            resp = quad_grid_builder.update_database(upsert_and_remove_data, qk, cmpl)
            logger.debug('[{}/{}] DONE {}.'.format(cnt, len_data, resp))



        status = b'200 OK'
        response = json.dumps(data)
        response_headers = [('Content-type', 'application/json'),
                            ('Content-Length', str(len(response)))
        ]
        start_response(status, response_headers)
        return response

    else:
        logger.error('Don\'t know what to do with action [{}]'.format(action))




class BinaryWriter:

    def __init__(self, **kwargs):
        # self.log = logger or logging.getLogger(__name__)
        self.log = kwargs.get('logger', logging.getLogger(__name__))


    def write_binary(self, binfile, data):
        # self.log.debug('Writing data {}'.format(data))
        for k, v in data.iteritems():
            k = int(k)*2
            # self.log.debug('New entry id: {} => {:03b}, shifted: {:08b}'.format(int(k/2.0), v, v << 5))

            with open(binfile, "rb+") as f:
                f.seek(k)
                # line = f.readline()
                byte = f.read(1)
                binary_old, = struct.unpack('>B', byte) # >h ... big-endian short, >b ... big-endian char
                binary_new = (binary_old << 3) & 255 #65535
                binary_new = (binary_new >> 3) | (v << 5)
                # binary = binary >> 4
                self.log.debug('Addr {}: old {:08b} ({}) => new {:08b} ({})'.format(int(k), binary_old, binary_old, binary_new, binary_new))
                f.seek(k)
                # 0011010000111000
                f.write(struct.pack('B', binary_new))
                # f.write('{:b}'.format(binary_new))
                # f.write(bytearray(binary_new))




class BinaryReader:

    def __init__(self, **kwargs):
        self.log = kwargs.get('logger', logging.getLogger(__name__))
        self.cell_size = kwargs.get('cellsize', 10.0/60.0**2)
        self.transform = TransformHelper(logger=self.log)


    def read_binary(self, binfile, data):
        """ @param data is of @type Vector with the structure:
            key = most west cell, value = number of cells to the east
        """
        # init as vector of length line count
        # ret_matrix = [-1] * len(data.keys()) # return data
        poly = {"type":"FeatureCollection",
                  "features":[]}

        with open(binfile, "rb") as f:
            for cnt, line_1st_id  in enumerate(data.keys()):
            # for line_1st_id, num_cells in data.iteritems():
                num_cells = data[line_1st_id]
                line_1st_addr = int(line_1st_id)*2
                # self.log.debug('Entry id: {} => {:03b}, shifted: {:08b}'.format(int(line_1st_id), num_cells, num_cells << 5))
                # Seeline_1st_id can be called one of two ways:
                #   x.seek(offset)
                #   x.seek(offset, starting_point)
                f.seek(line_1st_addr)

                byte_string = f.read(2*num_cells)
                # int_from_byte = int.from_bytes(byte, byteorder='big')
                bytes_split = byte_string.split('\\')

                # memoryview() objects; these let you interpret the bytes as C datatypes without any extra work on your part, simply by casting a 'view' on the underlying bytes
                # see: https://stackoverflow.com/a/20024532
                mv = memoryview(bytes_split[0])#.cast('H')
                self.log.debug('[{}] Cell ID {}: bytes string split into {} 2 Byte sequences'.format(cnt, int(line_1st_id), int(len(mv)/2)))
                # ret_matrix[cnt] = {}# * num_cells
                # every bytes in memoryview, b/c a cell's data is 2 byte long
                for offset_cnt in range(0, len(mv), 2):
                    # self.log.debug('bytes string {}'.format(mv[offset_cnt]))
                    binary, = struct.unpack('>B', mv[offset_cnt])
                    completeness = binary >> 5
                    # self.log.debug('Byte at {} => {:03b}'.format(line_1st_addr+int(offset_cnt/2), completeness))#(self, binfile, data):
                    cell_id = int(line_1st_id)+int(offset_cnt/2)
                    coords = self.transform.id2coords(cell_id, self.cell_size)
                    # ret_matrix[cnt][cell_id] = {'cmpl':completeness, 'coor':coords}

                    feature = {"type":"Feature",
                         "properties":{"completeness": completeness,
                                       "id": cell_id},
                         "geometry":{"type":"Polygon",
                                     "coordinates": [coords]
                                    }};
                    poly['features'].append(feature)

        # self.log.debug('return matrix', ret_matrix)
        return poly # ret_matrix



class TransformHelper:

    def __init__(self, **kwargs):
        self.log = kwargs.get('logger', logging.getLogger(__name__))


    def id2coords(self, _id, cell_size):
        """ Transforms a cell ID into its corner coordinates """
        cells_to_right = _id % 129600
        cells_down = _id / 129600
        lat_bottom = 90-cells_down * cell_size # Lat3 BOTTOM left corner
        lon_left = cells_to_right * cell_size - 180.0 # Lon3 bottom LEFT corner
        lat_top = lat_bottom + cell_size
        lon_right = lon_left + cell_size
        coords = [[lon_left,lat_top],[lon_right,lat_top],[lon_right,lat_bottom],[lon_left,lat_bottom],[lon_left,lat_top]]
        return coords


    def coords2id(coords, cell_size):
        """ Transforms a cell's coordinates into its cell ID """
        cells_per_deg = 1/cell_size
        y = 90.0-coords[3][1] # y id running from north to south
        x = coords[0][0] + 180.0 # x id running from -180 Deg to +180 Deg
        y_coord = cells_per_deg*y # 360.0*y
        x_coord = cells_per_deg*x # 360.0*x
        _id = int(129600 * y_coord + x_coord)
        return _id


class QuadGridBuilder:

    def __init__(self, **kwargs):
        self.log = kwargs.get('logger', logging.getLogger(__name__))


    def quadgrid_from_bbox(self, bbox):
        sql = """
            SELECT cell_id, completeness, geom FROM cmpl_grid WHERE cell_id ~* CONCAT('^', '%s', '[0-3]*$');
        """
        bbox_sw_qk = self.latlon2quadkey(bbox[1], bbox[0], 18) # 122100231210313321
        bbox_ne_qk = self.latlon2quadkey(bbox[3], bbox[2], 18) # 122100231210313321

        common_qk = self.common_parent_quadkey(int(bbox_sw_qk), int(bbox_ne_qk))
        self.log.debug('[BBOX] common qk {} of ({}, {})'.format(common_qk, bbox_sw_qk, bbox_ne_qk))
        db_results = self.connect_obm_cmpl(sql, [(common_qk,)])
        self.log.debug('[BBOX] Getting {} tiles below common qk {}'.format(len(db_results), common_qk))

        bbox_shp = shape(box(*bbox))
        db_results_bb = [r for r in db_results if wkb.loads(r[2], hex=True).intersects(bbox_shp)]

        cmpls_db = {} # dict of quadkey => completeness
        for qk, cmpl, _ in db_results_bb:
            cmpls_db[qk] = cmpl

        level2go = 18 - len('{}'.format(common_qk))
        grid = self.quad_level_down(common_qk, level2go)
        grid_bb = [g for g in grid if g[1].intersects(bbox_shp)]
        self.log.debug('[BBOX] Working with {} tiles in BBOX {}'.format(len(grid_bb), bbox))

        poly = {"type":"FeatureCollection",
                  "features":[]}
        regex_str = '^{cell_id}[0-3]*$'
        for g in grid_bb:
            qk = g[0]
            # check whether this tile (at grid zoom level) is in the database
            cmpl_ptt = [c for c in cmpls_db if re.compile(regex_str.format(cell_id=c)).search(qk)]
            len_cmpl_ptt = len(cmpl_ptt)

            if len_cmpl_ptt == 1:
                if qk in cmpls_db:
                    cmpl = cmpls_db[qk]
                    del cmpls_db[qk]
                else:
                    cmpl = cmpls_db[cmpl_ptt[0]]
            else:
                # err, there's no tile above this quad cell
                self.log.error('found {} tiles in or above {} {}. Must be 1'.format(len_cmpl_ptt, qk, cmpl_ptt))
                if qk in cmpls_db:
                    del cmpls_db[qk]
                if len_cmpl_ptt == 0:
                    cmpl = -1 # empty tile
                else:
                    cmpl = -2 # overlapping tiles

            feature = {"type":"Feature",
                 "properties":{"completeness": cmpl,
                               "id": qk},
                       "geometry":mapping(g[1])};
            poly['features'].append(feature)

        return poly


    def latlon2quadkey(self, lat, lon, zoom):
        point = Point.from_latitude_longitude(latitude=lat, longitude=lon) # point from lat lon in WGS84
        tile = Tile.for_latitude_longitude(point.latitude_longitude[0], point.latitude_longitude[1], zoom)
        return tile.quad_tree


    def tile_bounds(self, qk):
        t = Tile.from_quad_tree('{}'.format(qk)) # tile from a quad tree repr string
        bounds = t.bounds
        return bounds


    def quadkey2bbox_geom(self, qk):
        bb = self.quadkey2bbox(qk)
        return mapping(bb)

    def quadkey2bbox(self, qk):
        bounds = self.tile_bounds(qk)
        bb = shape(box(bounds[0].longitude, bounds[0].latitude, bounds[1].longitude, bounds[1].latitude))
        return bb



    def common_parent_quadkey(self, q1, q2):
        while (q1 != q2):
            q1 /= 10
            q2 /= 10
        return q1


    """ go down the quad tree by number of levels """
    def quad_level_down(self, qk, levels, grid = None):
        if grid == None:
            grid = []
        if levels == 0: # return statement
            # self.log.warning('... qk {}'.format(qk))
            bb = self.quadkey2bbox(qk)
            grid += [(qk, bb)]
        else:
            for q in range(0,4,1):
                next_qk = '{}{}'.format(qk,q)
                self.quad_level_down(next_qk, levels-1, grid)

        return grid



    def same_quadrant_leafs(self, quad_key):
        parent_cell = '{}'.format(quad_key)[:-1]
        """ of the theoretical quad cells on the same level as quad_key get those that are in the DB """
        child_cells = []
        for i in range(0,4):
            child_cells.append('{}{}'.format(parent_cell, i))
        return child_cells




    def upsert_quad_leafs(self, quad_start_leafs, leafs=None, **argv):
        regex_str = '^{cell_id}[0-3]*$'
        if leafs is None: # at the end we return leafs to upsert or remove
            leafs = {'upsert':[], 'remove':[]}

        quad_level = argv.get('quad_level', len('{}'.format(quad_start_leafs[0])) if len(quad_start_leafs)>0 else -1 )
        self.log.debug('[QL:{}] Calculating ...'.format(quad_level))

        # TODO
        if len(quad_start_leafs) == 0:
            quad_start_leafs_db = []
            self.log.debug('[QL:{}] No quad start leafs.'. format(quad_level))
        else:
            sql_regex = ['^{}$'.format(leaf) for leaf in quad_start_leafs]
            quad_start_leafs_db = self.db_leafs(sql_regex)

        if quad_start_leafs_db is False:
            self.log.debug('[QL:{}] Insert new leafs {}.'.format(quad_level, quad_start_leafs))
            leafs['upsert'] += quad_start_leafs
            # find next leaf upwards the tree, this will become a parent node (=the cell gets removed)
            # also determine all new leafs (=cells) to cover the world completely
            parent_cell = '{}'.format(quad_start_leafs[0])[:-1]
            parent_cell_db = self.db_leafs(['^{}$'.format(parent_cell)])

            if not parent_cell_db:
                parent_quad_level = quad_level - 1
                self.log.debug('[QL:{}] There is no parent leaf {}. Trying quad level {} ...'.format(quad_level, parent_cell, parent_quad_level))

                # go upwards one level
                parent_complement_leafs_gen = self.traverse_quadtree_upwards(parent_cell, parent_cell[:-1])
                pcc = next(parent_complement_leafs_gen)
                try:
                    next(parent_complement_leafs_gen)
                except StopIteration:
                    pass # all good
                parent_complement_leafs = pcc[1]

                # We have to check that the 3 complement cells in the parent quad level we are about to recurse into do not overlap any existing tile. We reduce the 'parent complement leafs' list accordingly.
                parent_complement_leafs_db = self.db_leafs(parent_complement_leafs)
                if parent_complement_leafs_db is not False:
                    parent_complement_leafs_nonconflicting = [c for c in parent_complement_leafs if len(self.search_pattern_in_db_cells(
                        re.compile(regex_str.format(cell_id=c)), parent_complement_leafs_db.keys())) == 0]
                    self.log.debug('[QL:{}] Reduced parent complement leafs {} to {}.'.format(quad_level, parent_complement_leafs, parent_complement_leafs_nonconflicting))
                    parent_complement_leafs = parent_complement_leafs_nonconflicting

                self.log.debug('[QL:{}] ... Recurse upwards one level to {} with complementary leafs {}.'.format(quad_level, quad_level-1, parent_complement_leafs))
                argv['quad_level'] = parent_quad_level
                self.upsert_quad_leafs(parent_complement_leafs, leafs, **argv)

            elif len(parent_cell_db) == 1:
                # we have to remove this leaf and insert subordinate quad key cells
                self.log.debug('[QL:{}] Found parent leaf {}.'.format(quad_level, parent_cell)) #122101231 trace_leafs[next_leaf_above]
                # get all quad tiles up to one level above
                caq = self.complement_and_above_quadrants(parent_cell, parent_cell[:-1])
                # these are the complement leafs for the above node we have to add
                complement_leafs = [l for l in caq[0] if l != parent_cell]

                # here we have to check whether the complement cells conflict with the DB
                complement_leafs_db = self.db_leafs(complement_leafs)
                self.log.debug('[QL:{}] Found {} complementary leafs within next up level tile {}. Sorting out those not conflicting with the DB ...'.format(quad_level, len(complement_leafs_db), parent_cell[:-1]))

                # we search for those complement cells that do not regex match with the data base cells
                # thus we only take those cells where the length of that regex search list is zero
                complement_leafs_nonconflicting = [c for c in complement_leafs if len(self.search_pattern_in_db_cells(
                    re.compile(regex_str.format(cell_id=c)), complement_leafs_db.keys())) == 0]

                if len(complement_leafs_nonconflicting) == 0:
                    # error
                    self.log.warning('[QL:{}] No complementary leafs to insert.'.format(quad_level))
                else:
                    self.log.debug('[QL:{}] ... insert new complementary leafs {}.'.format(quad_level, complement_leafs_nonconflicting))
                    leafs['upsert'] += complement_leafs_nonconflicting

                self.log.debug('[QL:{}] Remove leaf {}.'.format(quad_level, parent_cell))
                leafs['remove'] += [(parent_cell, parent_cell_db[parent_cell][-1])] # tuple of cell quad key & compl
            else:
                self.log.error('[QL:{}] Error {} leafs. There cannot be more than 1 leaf.'.format(quad_level, len(parent_cell_db)))
                raise ValueError('[QL:{}] Parent node {} has {} DB entries: {}.'.format(quad_level, parent_cell, len(parent_cell_db), parent_cell_db))
        else: # we found any quad_start leafs in the DB
            quad_start = argv.get('quad_start', None)
            parent_cell = quad_start_leafs[0][:-1] if len(quad_start_leafs)>0 else -1
            self.log.debug('[QL:{}] Parent node {}: Found {} leafs'.format(quad_level, parent_cell, len(quad_start_leafs_db)))

            if parent_cell == -1:
                self.log.warning('[QL:{}] There is no parent cell to complementary nodes {}.'.format(quad_level, quad_start_leafs))
            else:

                if len(quad_start_leafs_db) != 4: # true for 18?
                    # if there are leafs there should be 4,
                    # TODO is this correct?
                    self.log.warning('[QL:{}] There should be 4 leafs, not {}.'.format(quad_level, len(quad_start_leafs_db)))

                # since there are no nodes in the DB (only leafs), if quad_start is found it must be a leaf
                if '{}'.format(quad_start) in quad_start_leafs_db:
                    self.log.debug('[QL:{}] {} is a leaf. Changing its completeness.'.format(quad_level, quad_start))
                    # we are a leaf, so we can change attributes
                    leafs['upsert'] += [quad_start]
                else:
                    # look below quad_start for leafs in the DB
                    regex_str = '^{cell_id}[0-3]*$'
                    child_cells = self.search_pattern_in_db_cells(re.compile(
                        regex_str.format(cell_id=quad_start)), quad_start_leafs_db.keys())

                    # we are a node, so there should not be any leafs or/and more nodes below quad_start
                    if len(child_cells) == 0:
                        # this basically means some error happened before and this quadkey used to be a leaf that is now missing
                        # we just add this cell again, because it is missing, which is wrong and there a no cells below quad_start
                        self.log.warning('[QL:{}] Stopped at {}. {} is a node with no leafs. Adding it again.'.format(quad_level, parent_cell, quad_start))
                        if not quad_start in leafs['upsert']:
                            leafs['upsert'] += [quad_start]
                    else:
                        self.log.warning('[QL:{}] Stopped at {}. {} is a node. Childs {}'.format(quad_level, parent_cell, quad_start, child_cells))

                        # TODO see if we ever land here. Then we have to deal with the leafs below quad_start before adding quad_start itself

            # lastly check if there's an overlapping tile
            db_params = self.fiddle_db_entry_tuplet(quad_start, srid, None)
            sql = """
                SELECT cell_id, completeness FROM cmpl_grid WHERE ST_Contains(geom, ST_Centroid(ST_MakeEnvelope({},{},{},{}, {})))
            """.format(*db_params[1:-1])
            db_poss_conf_leafs = self.connect_obm_cmpl(sql)
            db_poss_conf_leafs = [l for l in db_poss_conf_leafs if l[0] != quad_start]
            if len(db_poss_conf_leafs) > 0:
                # error TODO
                self.log.error('[QL:{}] Error {} overlapp {}'.format(quad_level, db_poss_conf_leafs, quad_start))
                for leaf in db_poss_conf_leafs:
                    if leaf not in leafs['remove']:
                        self.log.warning('[QL:{}] Removing leaf {}.'.format(quad_level, leaf[0]))
                        leafs['remove'] += [(leaf[0], leaf[1])]


        # self.log.info('>>> [QL:{}] Returning data changes: {}'.format(quad_level, leafs))
        return leafs


    def db_leafs(self, quad_keys):
        """ Returns @list quad_keys quad cells from the DB """
        quad_keys_sql = '|'.join('{}'.format(cc) for cc in quad_keys)
        sql = """
            SELECT cell_id, geom, completeness FROM {} WHERE
            cell_id ~* '{}';
            """.format(table_name, quad_keys_sql)

        # print sql
        db_result = self.connect_obm_cmpl(sql)
        if len(db_result) == 0:
            # no quad key was found in the DB
            return False
        else:
            leafs = {}
            for db_qc in db_result:
                # bounds = self.tile_bounds(db_qc[0])
                leafs[db_qc[0]] = self.fiddle_db_entry_tuplet(db_qc[0], srid, db_qc[2])
            return leafs


    def fiddle_db_entry_tuplet(self, quadkey, srid, cmpl):
        """ returns a tuplet of values to be put in the DB """
        cell_id = '{}'.format(quadkey)
        bounds = self.tile_bounds(quadkey)
        return (cell_id, bounds[0].longitude, bounds[0].latitude, bounds[1].longitude, bounds[1].latitude, srid, cmpl)




    def traverse_quadtree_upwards(self, quad_start, end_node=None):
        """ this assembles all complementary cells (c) and all non complementary (nc) cells above quad_start (Z)
            Z: the 1 cell where we change the completeness status
            c: all remaining cells that cover the whole world with a minimum amount of cells
            nc: all cells above Z that we potentially need to remove from the DB

                ____________ _ _ _
                  /nc      /|
                 /        /
                /        /
            ___/________/_ _ _
              |     ,   |   ,
              |  ..,_______,________/__
              |   /c  /c  /c       /
              |  /___/___/        /
              | /c  /Z/_/        /
            __|/___/_/_/________/__
        """

        # print 'quad start', quad_start, 'end node', end_node
        if len(quad_start) == 0 or quad_start == end_node:
            return
        endian_quadrant = quad_start[-1]
        next_quad = quad_start[0:-1]
        quadrants = other_quadrants[endian_quadrant]
        yield quad_start, [next_quad + q for q in quadrants]
        # print next_quad, endian_quadrant, other_quadrants[endian_quadrant]
        for q in self.traverse_quadtree_upwards(next_quad, end_node):
            yield q



    def complement_and_above_quadrants(self, quad_start, end_node=None):
        """ quad_start: quadkey of the cell that "triggert" a calculation """
        # TODO check whether we need to change the cell
        # print 'determine cells dependant on cell', quad_start
        quads = self.traverse_quadtree_upwards('{}'.format(quad_start), end_node)
        q1st = next(quads) # the first quadrant entrys, the very first one is the one we want to modify
        above_quad_quadrants = [] # all the quadrants above the current quad
        complement_quad_triplets = [] # all the other quadrants to fill the rest of the world

        # we want all cells in the same level as the modified cell...
        for q in [q1st[0]] + q1st[1]:
            complement_quad_triplets.append(q)

        # ... as well as all parent cells up the tree
        for qs in quads:
            above_quad_quadrants.append(qs[0]) # cells that are above and potentially cover quad_start and eventually need to be removed from the DB
            for q in qs[1]:
                complement_quad_triplets.append(q) # all complementary cell triplets per quadtree level

        if len([i for i in complement_quad_triplets if i in above_quad_quadrants]) > 0:
            # string for db query
            # TODO do we need those strings anywere else?
            above_quad_quadrants_sqlstr = ','.join('\'{}\''.format(qq) for qq in above_quad_quadrants)
            complement_quad_triplets_sqlstr = ','.join('\'{}\''.format(qt) for qt in complement_quad_triplets)
            self.log.error('Error selecting complementary quadrants')
            self.log.debug('complementary cells {}'.format(above_quad_quadrants_sqlstr)) # all cells above us
            self.log.debug('cells above {}'.format(complement_quad_triplets_sqlstr)) # the minimum amount of all other cells to cover the whole world
        else:
            # print 'dependant DB cells', dependant_db_cells_sqlstr
            pass # print 'Okay'

        return complement_quad_triplets, above_quad_quadrants




    def search_pattern_in_db_cells(self, pattern, db_quad_cells):
        # print 'pattern', pattern, 'DB quad cells', db_quad_cells
        pattern_matches = []
        for qc in db_quad_cells:
            if(pattern.search(qc)):
                try:
                    pattern_matches.append(db_quad_cells[qc])
                except:
                    pattern_matches.append(qc)
        # print 'pattern matches', pattern_matches
        return pattern_matches



    def update_database(self, upsert_and_remove_data, quad_start, new_cmpl):
        remove = [r[0] for r in upsert_and_remove_data['remove']] if len(upsert_and_remove_data['remove']) > 0 else []
        if len(upsert_and_remove_data['remove']) > 0:
            remove = [r[0] for r in upsert_and_remove_data['remove']]
            complement_cells_cmpl = upsert_and_remove_data['remove'][0][1] if len(remove) == 1 else 0
            # only auto fill complement cells if they are of unknown, water or empty completeness
            complement_cells_cmpl = complement_cells_cmpl if complement_cells_cmpl in lose_no_information_cmpl else 0
        else:
            remove = []
            complement_cells_cmpl = 0
        # print 'remove', remove, 'complement cells cmpl', complement_cells_cmpl

        upsert = [self.fiddle_db_entry_tuplet(u, srid, new_cmpl) if str(u) == str(quad_start) else
                  self.fiddle_db_entry_tuplet(u, srid, complement_cells_cmpl) for u in upsert_and_remove_data['upsert']]

        rem_sql = ','.join('\'{}\''.format(d) for d in remove)
        # self.log.debug('rem {}, ups {}'.format(rem_sql, upsert))

        upsert_template = '%s, ST_MakeEnvelope(%s,%s,%s,%s, %s), %s'

        sql_beg = """BEGIN;"""
        sql_del = """
        DELETE FROM {} WHERE cell_id IN ({});
        """.format(table_name, rem_sql)
        if len(remove) == 0:
            sql_del = """"""

        sql_ups = """
        INSERT INTO {} (cell_id, geom, completeness)
        VALUES ({})
        ON CONFLICT (cell_id) DO UPDATE
          SET cell_id = excluded.cell_id,
              geom = excluded.geom,
              completeness = excluded.completeness;
        COMMIT;
        """.format(table_name, upsert_template)
        sql = sql_beg + sql_del + sql_ups
        # self.log.debug('[DB] Upsert: {}'.format(upsert))

        db_result = self.connect_obm_cmpl(sql, upsert)
        return db_result



    """  """
    def connect_obm_cmpl(self, sql = "SELECT version();", data = None ):
        # dsn = """user='{}' password='{}' host='{}' port='{}' databse='{}'""".format('prehn','HansaRostock','127.0.0.1','5432','obm_cmpl')
        try:
            connection = psycopg2.connect(user = "prehn",
                                          password = "HansaRostock",
                                          host = "127.0.0.1",
                                          port = "5432",
                                          database = "obm_cmpl")
            cursor = connection.cursor()

            if data is None:
                # fetch from DB
                cursor.execute(sql)
                record = cursor.fetchall()
            else:
                if len(data) == 1:
                    cursor.execute(sql, data[0])
                else:
                    cursor.executemany(sql, data)
                cur_msg = cursor.statusmessage
                cur_cnt = cursor.rowcount
                self.log.debug('[CONN] statusmessage {}, rowcount {}'.format(cur_msg, cur_cnt))
                if cur_cnt == -1:
                    record = [1]
                else:
                    record = cursor.fetchall()
                connection.commit()
            return record

        except (Exception, psycopg2.Error) as error :
            self.log.exception("Error while connecting to PostgreSQL {}".format(error))
        finally:
            #closing database connection.
            if(connection):
                cursor.close()
                connection.close()
