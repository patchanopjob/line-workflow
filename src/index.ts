import express, { type Request, type Response } from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World')
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`)
})
