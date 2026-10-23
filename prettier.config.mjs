/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  semi: false,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/app/globals.css',
}

export default config
