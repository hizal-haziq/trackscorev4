import { validateRole } from "./auth.js";
import { secureHandler } from "./security.js";
export const handler = secureHandler(async (event) => {
  const auth = validateRole(event, ["manager", "assessor", "vendor"], {
    allowPasswordChange: true,
  });
  if (!auth.authorized)
    return {
      statusCode: auth.statusCode,
      body: JSON.stringify({ success: false, error: auth.error }),
    };
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      role: auth.role,
      mustChangePassword: auth.user.mustChangePassword === true,
      expiresAt: auth.user.exp * 1000,
    }),
  };
}, "verify-session");
