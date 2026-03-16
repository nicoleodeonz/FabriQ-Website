export interface RegionOption {
  code: string;
  name: string;
}

export interface CityMunicipalityOption {
  code: string;
  name: string;
}

export interface BarangayOption {
  code: string;
  name: string;
}

const API_BASE = "https://psgc.gitlab.io/api";

const cityCache = new Map<string, CityMunicipalityOption[]>();
const barangayCache = new Map<string, BarangayOption[]>();

let regionsStore: RegionOption[] | null = null;

const sortByName = <T extends { name: string }>(items: T[]) => {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
};

const toRegion = (raw: any): RegionOption => ({
  code: String(raw.code || ""),
  name: String(raw.name || ""),
});

const toCity = (raw: any): CityMunicipalityOption => ({
  code: String(raw.code || ""),
  name: String(raw.name || ""),
});

const toBarangay = (raw: any): BarangayOption => ({
  code: String(raw.code || ""),
  name: String(raw.name || ""),
});

const fetchJSON = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load address data (${response.status})`);
  }
  return response.json();
};

export const phAddressAPI = {
  async getRegions(): Promise<RegionOption[]> {
    if (regionsStore) {
      return regionsStore;
    }

    const raw = await fetchJSON(`${API_BASE}/regions/`);
    regionsStore = sortByName((raw || []).map(toRegion).filter((item: RegionOption) => item.code && item.name));
    return regionsStore;
  },

  async getCitiesByRegion(regionCode: string): Promise<CityMunicipalityOption[]> {
    if (!regionCode) return [];

    const cached = cityCache.get(regionCode);
    if (cached) {
      return cached;
    }

    const raw = await fetchJSON(`${API_BASE}/regions/${encodeURIComponent(regionCode)}/cities-municipalities/`);
    const mapped: CityMunicipalityOption[] = sortByName(
      (raw || [])
        .map(toCity)
        .filter((item: CityMunicipalityOption) => Boolean(item.code && item.name))
    );
    cityCache.set(regionCode, mapped);
    return mapped;
  },

  async getBarangaysByCity(cityCode: string): Promise<BarangayOption[]> {
    if (!cityCode) return [];

    const cached = barangayCache.get(cityCode);
    if (cached) {
      return cached;
    }

    const raw = await fetchJSON(`${API_BASE}/cities-municipalities/${encodeURIComponent(cityCode)}/barangays/`);
    const mapped: BarangayOption[] = sortByName(
      (raw || [])
        .map(toBarangay)
        .filter((item: BarangayOption) => Boolean(item.code && item.name))
    );
    barangayCache.set(cityCode, mapped);
    return mapped;
  },
};
