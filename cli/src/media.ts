import path from "node:path";

import {
  isRemote,
  localMedia,
  reasonOf,
  type MediaResolver,
  type ResolvedMedia,
} from "@ankimd/core";

/*
 * Media resolution over the network, which the library refuses on purpose.
 *
 * `@ankimd/core` ships `localMedia` and stops there: a library has no business
 * deciding that a conversion may open a socket. This command does decide, and
 * `--remote-media` is how a caller says so.
 *
 * A second copy of `ankimd/cli/src/media.ts`, deliberately, with one difference:
 * there the flag is `--no-remote-media` and downloading is the default, because
 * that command has always had it. Here it is off until asked for, since reaching
 * the network is a new capability on a command people already run. A fix here is
 * worth carrying to the other; the root `AGENTS.md` says so where both are named.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The extension a URL implies, from its path alone.
 *
 * The path alone, because a host name has dots in it and a query string can have
 * anything at all: reading the extension off the whole URL turns
 * `https://example.org/image` into a file named `.org/image`.
 */
function extensionOf(url: string): string {
  return path.posix.extname(new URL(url).pathname);
}

async function download(src: string, timeoutMs: number): Promise<ResolvedMedia> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(src, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return { data: new Uint8Array(await response.arrayBuffer()), extension: extensionOf(src) };
  } catch (error) {
    /* The controller, not the error: Node's `fetch` has at points reported an abort
       as a `TypeError: fetch failed` carrying the `DOMException` as its cause, and a
       name read off the outer error calls that a download failure. The signal cannot
       be fooled, because nothing else aborts this request. */
    const timedOut = controller.signal.aborted;

    throw new Error(
      timedOut ? `timed out after ${timeoutMs}ms` : `could not download ${src}: ${reasonOf(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface MediaOptions {
  /** Where to look for a local image, in order. One entry per source file's directory. */
  directories: readonly string[];
  remote: boolean;
  timeoutMs: number;
}

/**
 * A resolver that reads local files and, when told to, downloads remote ones.
 *
 * Several directories rather than one because the sibling command builds a deck from
 * a folder of files, each with its own images beside it. `md anki` takes one file and
 * so passes one directory; the shape is kept so the two copies stay diffable.
 */
export function createMediaResolver(options: Readonly<MediaOptions>): MediaResolver {
  const { directories, remote, timeoutMs } = options;
  const readers = directories.map((directory) => localMedia(directory));

  return async (src: string): Promise<ResolvedMedia> => {
    if (isRemote(src)) {
      if (!remote) {
        throw new Error(
          `remote media is off, so ${src} was not downloaded. ` +
            `Pass --remote-media, or save the image beside the deck.`,
        );
      }

      return download(src, timeoutMs);
    }

    const reasons: string[] = [];

    for (const read of readers) {
      try {
        /* The first hit wins, so this stops early; `no-await-in-loop` is off here
           for the same reason it is off everywhere else in this package. */
        return await read(src);
      } catch (error) {
        reasons.push(reasonOf(error));
      }
    }

    throw new Error(reasons.join("; "));
  };
}
