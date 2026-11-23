// Props of the optional LoginPage a plugin exports. The host shows it at the plugin's route, in place
// of its own sign-in prompt, to an anonymous visitor of a plugin that requires auth. No context: the
// visitor is anonymous.
export interface PluginLoginPageProps {
  // Start the host's sign-in.
  login: () => void;
  // Start the host's sign-up.
  signup: () => void;
}
