module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        browsers: ['last 3 versions'],
        ios: '8'
      },
      modules: false
    }]
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-object-rest-spread'
  ]
};