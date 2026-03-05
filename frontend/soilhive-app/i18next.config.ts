import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: [
    "en"
  ],
  extract: {
    input: "src/components/AvailabilityMobileNavigation/**/*.{js,jsx,ts,tsx}",
    output: "public/locales/{{language}}/{{namespace}}.json",
    defaultNS: "availability"
  }
})