export interface DeviceInfo {
  deviceType: 'mobile' | 'desktop' | 'tablet';
  operatingSystem: string;
  browser: string;
}

export function detectDevice(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // Device Type Detection
  let deviceType: 'mobile' | 'desktop' | 'tablet' = 'desktop';
  
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
    deviceType = 'tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(userAgent)) {
    deviceType = 'mobile';
  }

  // Operating System Detection
  let operatingSystem = 'Unknown';
  
  if (ua.includes('windows')) {
    operatingSystem = 'Windows';
  } else if (ua.includes('mac os') || ua.includes('macos')) {
    operatingSystem = 'macOS';
  } else if (ua.includes('linux')) {
    operatingSystem = 'Linux';
  } else if (ua.includes('android')) {
    operatingSystem = 'Android';
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    operatingSystem = 'iOS';
  }

  // Browser Detection
  let browser = 'Unknown';
  
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('opera')) {
    browser = 'Opera';
  }

  return {
    deviceType,
    operatingSystem,
    browser
  };
}

export function getClientIP(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.headers['x-client-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    req.ip ||
    'Unknown'
  );
}
