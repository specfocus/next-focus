import type { Arrayable, Options, Part } from '../types';

const separator = '\r\n\r\n';

async function* generate<T>(
  source: AsyncIterable<Buffer>,
  boundary: string,
  options?: Options
): AsyncGenerator<Arrayable<Buffer | Part<T, Buffer>>> {
  const is_eager = !options || !options.multiple;

  let buffer = '';
  let is_preamble = true;
  let payloads: Buffer[] = [];

  try {
    outer: for await (const chunk of source) {
      const idx_chunk = chunk.indexOf(boundary);
      let idx_boundary = buffer.length;
      buffer += chunk;

      if (!!~idx_chunk) {
        // chunk itself had `boundary` marker
        idx_boundary += idx_chunk;
      } else {
        // search combined (boundary can be across chunks)
        idx_boundary = buffer.indexOf(boundary);
      }

      payloads = [];
      while (!!~idx_boundary) {
        const current = buffer.substring(0, idx_boundary);
        const next = buffer.substring(idx_boundary + boundary.length);

        if (is_preamble) {
          is_preamble = false;
        } else {
          const headers: Record<string, string> = {};
          const idx_headers = current.indexOf(separator);
          const arr_headers = buffer.slice(0, idx_headers).toString().trim().split(/\r\n/);

          // parse headers
          let tmp;
          while (tmp = arr_headers.shift()) {
            tmp = tmp.split(': ');
            headers[tmp.shift().toLowerCase()] = tmp.join(': ');
          }

          let body: T | string = current.substring(idx_headers + separator.length, current.lastIndexOf('\r\n'));
          let is_json = false;

          tmp = headers['content-type'];
          if (tmp && !!~tmp.indexOf('application/json')) {
            try {
              body = JSON.parse(body) as T;
              is_json = true;
            } catch (_) {
            }
          }

          tmp = { headers, body, json: is_json } as Part<T, string>;
          is_eager ? yield tmp : payloads.push(tmp);

          // hit a tail boundary, break
          if (next.substring(0, 2) === '--') break outer;
        }

        buffer = next;
        idx_boundary = buffer.indexOf(boundary);
      }

      if (payloads.length) yield payloads;
    }
  } finally {
    if (payloads.length) yield payloads;
  }
}

export default generate;
