import expressLib, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = expressLib.Router();

const CENSUS_GEOCODER_URL =
  process.env.CENSUS_GEOCODER_URL ||
  'https://geocoding.geo.census.gov/geocoder/geographies/address';
const HUD_LMI_API_URL =
  process.env.HUD_LMI_API_URL ||
  'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Low_to_Moderate_Income_Population_by_Tract/FeatureServer/4/query';
const DEFAULT_BENCHMARK = process.env.DEFAULT_BENCHMARK || 'Public_AR_Current';
const DEFAULT_VINTAGE = process.env.DEFAULT_VINTAGE || 'Current_Current';
const LMI_THRESHOLD = parseFloat(process.env.LMI_THRESHOLD || '51');

interface Address {
  street: string;
  city: string;
  state: string;
  zip?: string;
}

router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'CRA Eligibility Service',
  });
});

router.post('/check', async (req: Request, res: Response) => {
  const address: Address | undefined = req.body?.address;

  if (!address) {
    return res.status(400).json({
      error: 'Address required',
      message: 'The "address" field is required',
    });
  }

  const requiredFields: (keyof Address)[] = ['street', 'city', 'state'];
  const missingFields = requiredFields.filter((f) => !address[f]);
  if (missingFields.length) {
    return res.status(400).json({
      error: 'Missing fields',
      message: `The following fields are required: ${missingFields.join(', ')}`,
    });
  }

  try {
    const geocode = await geocodeAddress(address);
    console.log('geocode', JSON.stringify(geocode));
    if (!geocode) {
      return res.status(404).json({
        error: 'Address not found',
        message: 'Unable to geocode the provided address',
      });
    }

    const lmi = await getLmiData(geocode.geoid);
    if (!lmi) {
      return res.status(404).json({
        error: 'LMI data not available',
        message: 'Unable to retrieve LMI data for this census tract',
      });
    }

    const responseData = {
      eligible: lmi.is_lmi_area,
      address,
      census_tract: {
        geoid: geocode.geoid,
        name: geocode.name,
      },
      lmi_data: {
        low_mod_income_percentage: lmi.low_mod_income_percentage,
        is_lmi_area: lmi.is_lmi_area,
        threshold: lmi.threshold,
        low_mod_income_count: lmi.low_mod_income_count,
        total_population: lmi.total_population,
      },
      coordinates: geocode.coordinates,
      matched_address: geocode.matched_address,
      timestamp: new Date().toISOString(),
    };

    return res.json(responseData);
  } catch (err) {
    console.error('Error during CRA check:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;

/* Helper functions */
async function geocodeAddress(address: Address) {
  console.log('geocodeAddress', JSON.stringify(address));
  const params = new URLSearchParams({
    street: address.street,
    city: address.city,
    state: address.state,
    benchmark: DEFAULT_BENCHMARK,
    vintage: DEFAULT_VINTAGE,
    format: 'json',
  });
  if (address.zip) params.append('zip', address.zip);

  const url = `${CENSUS_GEOCODER_URL}?${params.toString()}`;
  console.log('geocodeAddress url', url);
  const resp = await fetch(url, { timeout: 10000 } as any);
  if (!resp.ok) return null;
  const data = await resp.json();

  console.log('--------------------------------');
  console.log('geocodeAddress data', JSON.stringify(data, null, 2));
  console.log('--------------------------------');

  const matches = data?.result?.addressMatches;
  if (!matches?.length) return null;
  const match = matches[0];

  const censusTracts = match?.geographies?.['Census Tracts'];
  if (!censusTracts?.length) return null;

  const tract = censusTracts[0];

  return {
    geoid: tract.GEOID,
    name: tract.NAME,
    coordinates: {
      latitude: match.coordinates?.y,
      longitude: match.coordinates?.x,
    },
    matched_address: match.matchedAddress,
  };
}

/**
 * HUD LMI API URL 

  ArcGIS REST API URL from HUD for LMI data by census tract is:

https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Low_to_Moderate_Income_Population_by_Tract/FeatureServer/4/query

Available fields include:
- GEOID: Census tract identifier
- STATE: State
- COUNTY: County
- TRACT: Census tract
- LOWMOD: Low/moderate income population
- LOWMODUNIV: Total population
- LOWMODPCT: LMI percentage
- UCLMOD: Urban LMI population
- UCLMODU: Total urban population 
- UCLMODPCT: Urban LMI percentage

Example query URL:
https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Low_to_Moderate_Income_Population_by_Tract/FeatureServer/4/query?where=1%3D1&outFields=*&outSR=4326&f=json

 * */
async function getLmiData(geoid: string) {
  const params = new URLSearchParams({
    where: `GEOID='${geoid}'`,
    outFields: 'GEOID,LOWMOD,LOWMODUNIV,LOWMODPCT',
    f: 'json',
  });
  const url = `${HUD_LMI_API_URL}?${params.toString()}`;
  const resp = await fetch(url, { timeout: 10000 } as any);
  if (!resp.ok) return null;
  const data = await resp.json();

  const feature = data?.features?.[0];
  if (!feature) return null;
  const attr = feature.attributes;

  const lowmod = attr.LOWMOD ?? 0;
  const lowmoduniv = attr.LOWMODUNIV ?? 0;
  const lowmodpct = attr.LOWMODPCT ?? 0;
  const pct =
    lowmodpct > 0
      ? lowmodpct
      : lowmoduniv > 0
      ? (lowmod / lowmoduniv) * 100
      : 0;

  return {
    geoid: attr.GEOID,
    low_mod_income_count: lowmod,
    total_population: lowmoduniv,
    low_mod_income_percentage: Math.round(pct * 100) / 100,
    is_lmi_area: pct >= LMI_THRESHOLD,
    threshold: LMI_THRESHOLD,
  };
}
