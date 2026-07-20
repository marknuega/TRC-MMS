import { app } from './app.js'

// Railway injects PORT. Hardcoding it makes the deploy look healthy but be unreachable.
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (${process.env.NODE_ENV || 'development'})`)
})
