"use strict"

require("dotenv").config()

const database = {
  url: process.env.DATABASE_URL,
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
}

module.exports = {
  development: database,
  production: database
}
