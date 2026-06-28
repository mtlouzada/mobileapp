// Parse the canonical skate-spot post body (see lib/spotmap/createSpot.ts) so
// the feed can render the location as a rich, tappable Google Maps link instead
// of raw "Spot Name:" / "🌐 lat, lng (address)" text.
//
//   Spot Name: <name>
//   🌐 <lat>, <lng> (<address>)
//
//   <description>
//   ...media...

export interface ParsedSpot {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** The body with the "Spot Name:" + coordinate lines removed (description + media). */
  rest: string;
}

// Coordinate line: optional 🌐 prefix, "lat, lng", optional "(address)".
// Decimals are required so we never mistake an ordinary number for coordinates.
const COORD_RE =
  /^(?:🌐\s*)?(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*(?:\(([^)]*)\))?\s*$/;
const NAME_RE = /^Spot Name:\s*(.+)$/i;

/** Returns parsed spot fields, or null when the body isn't a spot post. */
export function parseSpotBody(body: string | undefined | null): ParsedSpot | null {
  if (!body) return null;
  const lines = body.split("\n");

  let name = "";
  let nameIdx = -1;
  let coordIdx = -1;
  let lat = NaN;
  let lng = NaN;
  let address: string | null = null;

  // The canonical header sits at the very top; scan a small window to tolerate
  // a stray leading blank line.
  const limit = Math.min(lines.length, 6);
  for (let i = 0; i < limit; i++) {
    const l = lines[i].trim();
    if (nameIdx === -1) {
      const nm = l.match(NAME_RE);
      if (nm) {
        name = nm[1].trim();
        nameIdx = i;
        continue;
      }
    }
    if (coordIdx === -1) {
      const c = l.match(COORD_RE);
      if (c) {
        lat = parseFloat(c[1]);
        lng = parseFloat(c[2]);
        address = c[3]?.trim() || null;
        coordIdx = i;
      }
    }
  }

  // Require BOTH the name header and valid coordinates — that combination is
  // unique to spot posts, so ordinary posts never trigger the rich treatment.
  if (
    nameIdx === -1 ||
    coordIdx === -1 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  const rest = lines
    .filter((_, i) => i !== nameIdx && i !== coordIdx)
    .join("\n")
    .trim();

  return { name: name || address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng, address, rest };
}

/** Universal Google Maps link — opens the native app when installed, web otherwise. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
