export async function restockOrderIngredients(conn, order, userId) {
  if (!order.ingredients_deducted_at) return false;

  const requirements = await getOrderIngredientRequirements(conn, order.id);
  const stockById = await lockInventory(conn, order.id, requirements);

  for (const requirement of requirements) {
    const stock = stockById.get(requirement.ingredient_id);
    const balance = roundStockQuantity(
      Number(stock.quantity) + requirement.quantity_required,
    );

    await conn.query(
      'UPDATE inventory_items SET quantity = ? WHERE id = ?',
      [balance, stock.id],
    );

    await conn.query(
      `INSERT INTO stock_movements
         (item_id, movement_type, quantity, balance_after, reason, note, created_by)
       VALUES (?, 'in', ?, ?, 'Cancelled order restock', ?, ?)`,
      [stock.id, requirement.quantity_required, balance, order.order_no, userId],
    );

    await logActivity(
      userId,
      'Stock in',
      `${stock.name}: ${requirement.quantity_required} ${stock.unit} restocked from cancelled ${order.order_no}`,
      conn,
    );
  }

  await makeStockedMenuItemsAvailable(
    requirements.map((item) => item.ingredient_id),
    conn,
  );

  await conn.query(
    'UPDATE orders SET ingredients_deducted_at = NULL WHERE id = ?',
    [order.id],
  );

  return true;
}