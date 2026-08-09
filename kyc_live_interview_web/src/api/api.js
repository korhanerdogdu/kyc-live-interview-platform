import axios from 'axios';

// const API_BASE_URL = 'http://localhost:8080/api';
const API_BASE_URL = '/api';

/**
 * Generic GET (with cache-buster)
 */
export const getData = async (endpoint, token = null) => {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${API_BASE_URL}/${endpoint}`, {
      headers,
      // prevent any accidental caching
      params: { _ts: Date.now() },
    });
    return response.data;
  } catch (error) {
    console.error('Veri çekme hatası:', error);
    throw error;
  }
};

/**
 * Generic POST
 */
// src/api/api.js
export const postData = async (endpoint, data = {}, token = null) => {
  const isFormData = (typeof FormData !== 'undefined') && data instanceof FormData;
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  };
  const res = await axios.post(`/api/${endpoint}`, data ?? {}, { headers });
  return res.data;
};



/**
 * Generic PUT
 */
export const putData = async (endpoint, data) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/${endpoint}`, data);
    return response.data;
  } catch (error) {
    console.error('PUT hatası:', error);
    throw error;
  }
};

/**
 * Generic DELETE
 */
export const deleteData = async (endpoint) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/${endpoint}`);
    return response.data;
  } catch (error) {
    console.error('DELETE hatası:', error);
    throw error;
  }
};
