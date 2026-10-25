// Free Apple developer teams cannot sign the Sign in with Apple capability.
// expo-apple-authentication adds the entitlement automatically, so strip it unless explicitly enabled.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutAppleSignIn(config) {
  if (process.env.EXPO_PUBLIC_APPLE_SIGNIN === "1") return config;
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["com.apple.developer.applesignin"];
    return mod;
  });
};
