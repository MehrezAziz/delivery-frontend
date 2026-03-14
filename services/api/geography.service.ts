import { api } from './client';

export interface Country {
  id: string;
  name: string;
  isoCode: string;
  currencyCode: string;
  currencySymbol: string;
}

export interface Governorate {
  id: string;
  nameGovernorate: string;
}

export interface Delegation {
  id: string;
  nameDelegation: string;
  maxConfirmationDelayMinutes: number;
}

export const geographyService = {
  getCountries: () =>
    api.get<Country[]>('/geography/countries', { requiresAuth: false }),

  getGovernorates: (countryId: string) =>
    api.get<Governorate[]>(`/geography/countries/${countryId}/governorates`, { requiresAuth: false }),

  getDelegations: (governorateId: string) =>
    api.get<Delegation[]>(`/geography/governorates/${governorateId}/delegations`, { requiresAuth: false }),
};
