package com.forge.orders;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OrderServiceTest {
  private final OrderService service = new OrderService();

  @Test
  void acceptsValidQuantity() {
    assertTrue(service.createOrder(5));
  }

  @Test
  void rejectsZeroQuantity() {
    assertFalse(service.createOrder(0));
  }

  @Test
  void rejectsNegativeQuantity() {
    assertFalse(service.createOrder(-1));
  }
}