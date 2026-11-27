"""Check static transfer sizes and equality against the on-disk gallery and map inputs."""
import gzip
from http.client import HTTPConnection
from threading import Thread
from server import Handler, LabServer, PACKED_JSON_DIRS, ROOT, STATIC_JSON

with LabServer(('127.0.0.1', 0), Handler, daily_path=':memory:') as server:
    Thread(target=server.serve_forever, daemon=True).start()
    def request(path, encoding, method='GET', **headers):
        client = HTTPConnection('127.0.0.1', server.server_port)
        try:
            client.request(method, path, headers={'Accept-Encoding': encoding, **headers})
            response = client.getresponse()
            return response.status, response.headers, response.read()
        finally:
            client.close()

    try:
        packed_samples = {next(iter(sorted(directory.glob('*.json')))) for directory in PACKED_JSON_DIRS}
        for path in sorted(STATIC_JSON | packed_samples):
            url = '/' + path.relative_to(ROOT).as_posix() + '?revision=test'
            source = path.read_bytes()
            status, headers, encoded = request(url, 'gzip')
            assert status == 200 and headers['Content-Encoding'] == 'gzip'
            assert headers['Vary'] == 'Accept-Encoding'
            assert gzip.decompress(encoded) == source and len(encoded) < len(source)
            status, raw_headers, raw = request(url, 'gzip;q=0, identity')
            assert status == 200 and raw == source and 'Content-Encoding' not in raw_headers
            assert raw_headers['Vary'] == 'Accept-Encoding'
            status, head, body = request(url, 'gzip', 'HEAD')
            assert status == 200 and int(head['Content-Length']) == len(encoded) and not body
            status, cached, body = request(url, 'gzip', **{'If-Modified-Since': headers['Last-Modified']})
            assert status == 304 and cached['Vary'] == 'Accept-Encoding' and not body
            print(path.name, len(source), len(encoded))
        for url in ('/index.html', '/assets/weekly-packed/no-such-pose.json'):
            status, headers, body = request(url, 'gzip')
            assert status == (200 if url == '/index.html' else 404)
            assert 'Content-Encoding' not in headers
    finally:
        server.shutdown()
