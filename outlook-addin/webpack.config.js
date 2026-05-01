const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = async (env, argv) => {
  const isDev = argv.mode === 'development'

  let httpsOptions = true
  if (isDev) {
    try {
      const devCerts = require('office-addin-dev-certs')
      httpsOptions = await devCerts.getHttpsServerOptions()
    } catch {
      // Fallback to webpack built-in HTTPS if certs not installed yet
      httpsOptions = true
    }
  }

  return {
    entry: './src/taskpane/index.tsx',
    output: {
      path: path.resolve(__dirname, '../resources/outlook-addin'),
      filename: 'taskpane.js',
      clean: false,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.(tsx?|jsx?)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-typescript',
                ['@babel/preset-react', { runtime: 'automatic' }],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './taskpane.html',
        filename: 'taskpane.html',
      }),
    ],
    devServer: {
      port: 3000,
      server: isDev ? { type: 'https', options: httpsOptions } : 'http',
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      static: {
        directory: path.join(__dirname, 'assets'),
        publicPath: '/assets',
      },
    },
    devtool: isDev ? 'source-map' : false,
  }
}
