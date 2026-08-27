'use strict';

/**
 * Interface every laboratory integration must implement. Adding a second,
 * real provider means writing a class that implements sendOrder and
 * registering it in the factory (./index.js) — nothing in the domain layer
 * needs to change, since callers only ever depend on this shape.
 */
class LaboratoryAdapter {
  /**
   * @param {{ labOrderId: string, orderNumber: string, specimenBarcode: string, tests: Array }} _payload
   * @returns {Promise<{ externalReferenceId: string, acknowledgedAt: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async sendOrder(_payload) {
    throw new Error('sendOrder not implemented');
  }
}

module.exports = LaboratoryAdapter;
