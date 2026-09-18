const { withEntitlementsPlist } = require('expo/config-plugins')

// Local scheduling/permission APIs do not need APNs. Keep expo-notifications
// installed and autolinked; remove only its unused remote-push entitlement.
// Register BEFORE expo-notifications: SDK 54 runs earlier mod actions last.
// Revisit this policy before adding remote push, and re-test on SDK upgrades.
module.exports = function withLocalOnlyNotifications(config) {
  return withEntitlementsPlist(config, config => {
    delete config.modResults['aps-environment']
    return config
  })
}
