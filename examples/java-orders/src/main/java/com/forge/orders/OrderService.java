package com.forge.orders;

import com.forge.rules.OrderRules;

public class OrderService {
  private final OrderRules rules = new OrderRules();

  public boolean createOrder(int quantity) {
    return rules.isValidQuantity(quantity);
  }
}