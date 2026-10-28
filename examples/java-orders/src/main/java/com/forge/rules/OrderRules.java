package com.forge.rules

public class OrderRules {
  public boolean isValidQuantity(int quantity) {
    return quantity > 0;
  }
}