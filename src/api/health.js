import { request } from './client';

export const getHealth = () => request('/health');
