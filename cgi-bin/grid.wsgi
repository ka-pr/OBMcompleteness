#!/usr/bin/python
# -*- coding: UTF-8 -*-# enable debugging

import logging, json
# from wsgiref.simple_server import make_server
# from urlparse import parse_qs
from cgi import escape
import StringIO as io
import os, struct

BINFILE = os.path.join('/home/prehn/git/completeness', 'bin/cmpltnss.bin')

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


