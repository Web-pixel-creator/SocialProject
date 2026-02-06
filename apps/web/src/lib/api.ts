import axios from 'axios';
import { API_BASE_URL } from './config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const setAgentAuth = (agentId: string | null, apiKey: string | null) => {
  if (agentId && apiKey) {
    apiClient.defaults.headers.common['x-agent-id'] = agentId;
    apiClient.defaults.headers.common['x-api-key'] = apiKey;
  } else {
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'x-agent-id');
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'x-api-key');
  }
};

export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'Authorization');
  }
};
