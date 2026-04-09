
export async function geocodeAddress(address: string): Promise<[number, number]> {
  try {
    // Using Nominatim (OpenStreetMap) - Free, no API key required for low volume
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'NEMT-POC-App' // Nominatim requires a User-Agent
        }
      }
    );
    const data = await response.json();

    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      return [parseFloat(lat), parseFloat(lon)];
    } else {
      console.warn('Nominatim geocoding failed, using fallback');
      return [42.3314, -83.0458]; // Default to Detroit
    }
  } catch (error) {
    console.error('Error during geocoding:', error);
    return [42.3314, -83.0458];
  }
}
