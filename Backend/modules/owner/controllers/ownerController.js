import usersRouter, { getUsersHandlerChain } from './usersController.js';
import reportsRouter, { getReportsHandlerChain } from './reportsController.js';

export const ownerHandlers = { getUsersHandlerChain, getReportsHandlerChain };
export const ownerSubrouters = { usersRouter, reportsRouter };
