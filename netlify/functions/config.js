exports.handler = async (event, context) => {
  // Define the configuration object your frontend expects
  const config = {
    // Inject safe environment variables here
    APP_URL: process.env.APP_URL || "",
    API_BASE: "/api",
    
    // 🚨 CRITICAL SECURITY WARNING: 
    // Do NOT include your ASSESSOR_API_KEY or MANAGER_API_KEY here. 
    // This file is executed and downloaded by the user's browser. 
    // If you put secret keys in this file, anyone visiting your site can steal them.
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/javascript",
      // Prevent the browser from caching outdated environment variables
      "Cache-Control": "no-cache, no-store, must-revalidate", 
    },
    // Convert the object into a valid JavaScript assignment
    body: `window.APP_CONFIG = ${JSON.stringify(config)};`,
  };
};