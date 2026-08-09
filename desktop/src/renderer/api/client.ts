import axios from 'axios';
import { useAppStore } from '../store/useAppStore';

export const getApiClient = () => {
  const backendUrl = useAppStore.getState().backendUrl || 'http://localhost:5000';
  
  const client = axios.create({
    baseURL: backendUrl,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
};
