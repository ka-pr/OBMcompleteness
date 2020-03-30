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
from shapely.geometry import box, shape, mapping

# BINFILE = os.path.join('/home/prehn/git/completeness', 'bin/cmpltnss.bin')
BINFILE = os.path.join('/home/prehn/git/OBMcompleteness', 'bin/cmpltnss.bin')

def application(environ, start_response):
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s: %(levelname)-8s <[%(filename)s]> ...: %(message)s', datefmt='%Y.%m.%d %H:%M:%S')
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

    elif action == 'quad':
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
            SELECT cell_id, completeness FROM cmpl_grid WHERE cell_id ~* CONCAT('^', '%s', '[0-3]*$');
        """
        bbox_sw_qk = self.latlon2quadkey(bbox[1], bbox[0], 18) # 122100231210313321
        bbox_ne_qk = self.latlon2quadkey(bbox[3], bbox[2], 18) # 122100231210313321

        common_qk = self.common_parent_quadkey(int(bbox_sw_qk), int(bbox_ne_qk))
        db_results = self.connect_obm_cmpl(sql, [(common_qk,)])
        self.log.debug('Getting {} tiles below {}'.format(len(db_results), common_qk))
        cmpls = {} # dict of quadkey => completeness
        for qk, cmpl in db_results:
            cmpls[qk] = cmpl

        level2go = 18 - len('{}'.format(common_qk))

        grid = self.quad_level_down(common_qk, level2go)
        poly = {"type":"FeatureCollection",
                  "features":[]}
        for g in grid:
            qk = g[0]
            if qk in cmpls:
                cmpl = cmpls[qk]
            else:
                regex_str = '^{cell_id}[0-3]*$'
                cmpl_ptt = [c for c in cmpls if re.compile(regex_str.format(cell_id=c)).search(qk)]
                if len(cmpl_ptt) == 1:
                    cmpl = cmpls[cmpl_ptt[0]]
                else:
                    self.log.error('found in {} {}. Must be 1'.format(qk, cmpl_ptt))
                    cmpl = 0

            feature = {"type":"Feature",
                 "properties":{"completeness": cmpl,
                               "id": qk},
                     "geometry":g[1]};
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


    def quadkey2bbox(self, qk):
        bounds = self.tile_bounds(qk)
        bb = shape(box(bounds[0].longitude, bounds[0].latitude, bounds[1].longitude, bounds[1].latitude))
        return mapping(bb)



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


    """  """
    def connect_obm_cmpl(self, sql = "SELECT version();", data = None ):
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
