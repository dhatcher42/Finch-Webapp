import 'dotenv/config';
import Finch from '@tryfinch/finch-api';
import express from "express";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const tokens = new Map();

const client = new Finch({
  // TODO ASAP: Implement secret manager
  clientID: process.env['FINCH_CLIENT_ID'],
  clientSecret: process.env['FINCH_CLIENT_SECRET'],
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/connect", async (req, res) => {
  try {
    // Create a new connection with only required products and get the access token
    const connection = await client.sandbox.connections.create({
      provider_id: req.body.provider_id,
      products: ['company', 'directory', 'individual', 'employment'],
    });
    
    // TODO: Implement process for assisted authentication
    if (connection.authentication_type === 'assisted') {
      res.json({ error: 'Assisted authentication is not supported yet. Please use a different provider.' });
      return;
    }

    // Use the access token for further API calls
    tokens.set(connection.connection_id, connection.access_token);
    const authed = client.withAccessToken(connection.access_token);
    
    // Get the company and directory information for the connection
    const [company, directory] = await Promise.all([
      authed.hris.company.retrieve(),
      authed.hris.directory.list(),
    ]);

    // Return the connection ID, company, and directory information
    res.json({
      connection_id: connection.connection_id,
      company,
      directory,
    });
  // TODO: More expansive error handling + unify blocks
  } catch (err) {
    // Error if insufficient credentials
    if (err instanceof Finch.APIError && err.status === 403) {
      res.json({ error: 'Forbidden. Please check your credentials.' });
    }
    // Error if provider does not support necessary endpoints
    else if (err instanceof Finch.APIError && err.status === 501) {
      res.json({ error: 'Necessary endpoint not implemented for this provider. Please use a different provider.' });
    }
    // Generic Finch error catching
    else if (err instanceof Finch.APIError) {
      console.log(err.status);
      console.log(err.name);
      console.log(err.message);
      console.log(err.headers);
      res.json({ error: 'An error occurred. Please try again.' });
    }
    else {
      throw err;
    }
  }
});

app.get("/api/person", async (req, res) => {
  try {
    const authed = client.withAccessToken(tokens.get(req.query.connection_id));

    // Get the individual and employment information for the given individual ID
    const requests = [{ individual_id: req.query.individual_id}];
    const [individual, employment] = await Promise.all([
      authed.hris.individuals.retrieveMany({ requests }),
      authed.hris.employments.retrieveMany({ requests }),
    ]);

    // Return the individual and employment information
    res.json({
      individual: individual.responses[0].body,
      employment: employment.responses[0].body,
    });
  } catch (err) {
    // Error if insufficient credentials
    if (err instanceof Finch.APIError && err.status === 403) {
      res.json({ error: 'Forbidden. Please check your credentials.' });
      return;
    }
    // Error if provider does not support necessary endpoints
    else if (err instanceof Finch.APIError && err.status === 501) {
      res.json({ error: 'Necessary endpoint not implemented for this provider. Please use a different provider.' });
      return;
    }
    // Generic Finch error catching
    else if (err instanceof Finch.APIError) {
      console.log(err.status);
      console.log(err.name);
      console.log(err.message);
      console.log(err.headers);
    }
    else {
      throw err;
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});