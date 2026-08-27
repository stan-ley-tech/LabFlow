'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const createHealthRouter = require('./routes/health');
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const clinicianRoutes = require('./routes/clinicians');
const labTestRoutes = require('./routes/labTests');
const laboratoryRoutes = require('./routes/laboratories');
const labOrderRoutes = require('./routes/labOrders');
const specimenRoutes = require('./routes/specimens');
const labResultRoutes = require('./routes/labResults');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationId);
  app.use(requestLogger);

  app.use('/', createHealthRouter({ checkRabbitmq: false }));
  app.use('/auth', authRoutes);
  app.use('/patients', patientRoutes);
  app.use('/clinicians', clinicianRoutes);
  app.use('/lab-tests', labTestRoutes);
  app.use('/laboratories', laboratoryRoutes);
  app.use('/lab-orders', labOrderRoutes);
  app.use('/specimens', specimenRoutes);
  app.use('/lab-results', labResultRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
