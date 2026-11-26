import { ORDER_SELECT, loadOrderItems } from '../models/orderModel.js';
import {
  isKitchenVisibleStatus,
  KITCHEN_VISIBLE_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
  stripOrderPrices,
} from '../services/orderService.js';

const direction = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
const orderClause = `ORDER BY COALESCE(o.sent_at, o.created_at) ${direction}, o.id ${direction}`;