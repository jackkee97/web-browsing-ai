module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["dist", "node_modules"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
};
