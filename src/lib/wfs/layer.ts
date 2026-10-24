/**
 * Pinned contract of the Metsäkeskus forest-use declaration layer (MV-021).
 *
 * Discovered on 2026-10-24 with `pnpm wfs:describe` against
 * `https://avoin.metsakeskus.fi/rajapinnat/v1/ows/` (GeoServer, WFS 2.0.0). The answers are
 * recorded in `tests/fixtures/wfs/capabilities.xml` and `describe.xml`; the unit test
 * `wfs-layer-contract.test.ts` holds this file to them and the nightly live test holds it to
 * the real service. The layer *name* stays in `env.WFS_LAYER` so tests can redirect it
 * (ledger S13); `LAYER_NAME` is the value that was discovered.
 *
 * What the discovery showed (D-032):
 * - One feature per stand (kuvio): `id` is `forestusedeclaration.<n>`, and the stands of one
 *   declaration share `FORESTUSEDECLARATIONNUMBER`.
 * - The layer keeps history: in a 40 km box north-east of Helsinki 95 % of the features had
 *   `VALID_NOW = 0` (state 50, received 2003–2017). Queries must filter on `VALID_NOW = 1`.
 * - WFS 2.0 does not combine the `bbox` parameter with a filter, so the box goes into the
 *   filter as `BBOX(GEOMETRY, …)`.
 * - Every attribute is `nillable` and `minOccurs="0"`; the JSON output sends all of them,
 *   `null` when empty. Dates are ISO 8601 with a Finnish offset (`+02:00` / `+03:00`).
 */

/** Layer name advertised by `GetCapabilities` on the discovery date. */
export const LAYER_NAME = 'v1:forestusedeclaration'

export const LAYER_DISCOVERED_AT = '2026-10-24'

/** `DefaultCRS` of the layer; the client asks for EPSG:3067 explicitly as well. */
export const LAYER_DEFAULT_CRS = 'urn:ogc:def:crs:EPSG::3067'

/** Server-wide `CountDefault`: the most features one `GetFeature` returns. */
export const LAYER_COUNT_DEFAULT = 10_000

/** Name of the geometry property (`gml:SurfacePropertyType`: Polygon or MultiPolygon). */
export const GEOMETRY_FIELD = 'GEOMETRY'

/** Prefix of the feature `id`; the number after it is unique per stand. */
export const FEATURE_ID_PREFIX = 'forestusedeclaration.'

/** Declaration number shared by the stands of one declaration, e.g. `1-2026-012345`. */
export const DECLARATION_NUMBER_FIELD = 'FORESTUSEDECLARATIONNUMBER'

/**
 * `1` while the declaration is in force, `0` for history. In the discovery sample every
 * `VALID_NOW = 1` stand had `DECLARATIONSTATE` `40` and most history had `50` (code list 1002).
 */
export const VALID_NOW_FIELD = 'VALID_NOW'

/** Cutting method (hakkuutapa), code list 1014; see `hakkuutapa.ts`. */
export const CUTTING_TYPE_FIELD = 'CUTTINGREALIZATIONPRACTICE'

/** Stand area in hectares. */
export const AREA_FIELD = 'AREA'

export const DATE_FIELDS = {
  /** When the declaration arrived at Metsäkeskus (`receivedAt`). */
  received: 'DECLARATIONARRIVALDATE',
  /** When this stand arrived; differs from `received` for stands added later. */
  standReceived: 'STANDARRIVALDATE',
  /** Last change in the source system; the only timestamp always present. */
  updated: 'UPDATETIME',
  /** Always `null` in the discovery sample. */
  created: 'CREATIONTIME',
} as const

/** XSD type of an attribute in `DescribeFeatureType`. */
export type LayerAttributeType = 'string' | 'decimal' | 'dateTime'

/**
 * Every non-geometry attribute of the layer in `DescribeFeatureType` order, with its XSD
 * type. `REGERATIONAREA` is spelled that way by the source. `schemas.ts` builds the Zod
 * schema from this list.
 */
export const LAYER_ATTRIBUTES = {
  FORESTUSEDECLARATIONNUMBER: 'string',
  DECLARATIONREFERENCE: 'string',
  PROCESSINGAREANUMBER: 'decimal',
  DECLARATIONSTATE: 'string',
  DECLARATIONSTATEDATASOURCE: 'decimal',
  VALID_NOW: 'decimal',
  DECLARATIONSTANDREFERENCE: 'string',
  STANDNUMBER: 'decimal',
  STANDNUMBEREXTENSION: 'decimal',
  AREA: 'decimal',
  MAINGROUP: 'decimal',
  SUBGROUP: 'decimal',
  FERTILITYCLASS: 'decimal',
  SOILTYPE: 'decimal',
  DECLARATIONDEVELOPMENTCLASS: 'decimal',
  DECLARATIONMAINTREESPECIES: 'decimal',
  MEANAGE: 'decimal',
  MEANDIAMETER: 'decimal',
  HABITATCODE: 'decimal',
  DETAILEDHABITATCODE: 'decimal',
  OTHERHABITATCODE: 'decimal',
  CUTTINGPURPOSE: 'decimal',
  CUTTINGREALIZATIONPRACTICE: 'decimal',
  REGENERATIONCOMMITMENT: 'decimal',
  DECLSOILPREPARATIONOPERATION: 'decimal',
  DECLREGENERATIONOPERATION: 'decimal',
  HABITATOPERATION: 'decimal',
  FORESTDAMAGEQUALIFIER: 'decimal',
  COMPLETIONYEAR: 'decimal',
  REGENSOILPREPARATIONOPERATION: 'decimal',
  REGENERATIONYEAR: 'decimal',
  REGENERATIONOPERATION: 'decimal',
  REGERATIONAREA: 'decimal',
  DECLARATIONARRIVALDATE: 'dateTime',
  DECLARATIONARRIVALYEAR: 'string',
  DECLARATIONARRIVALMETHOD: 'decimal',
  STANDARRIVALDATE: 'dateTime',
  STANDARRIVALMETHOD: 'decimal',
  REGENERATIONARRIVALDATE: 'dateTime',
  DATASOURCE: 'decimal',
  CREATIONTIME: 'dateTime',
  UPDATETIME: 'dateTime',
} as const satisfies Record<string, LayerAttributeType>
