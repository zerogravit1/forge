package com.forge.inventory;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class InventoryServiceTest {
  private final InventoryService service = new InventoryService();
  
  @Test
  void acceptsAvailableInventory() {
    assertTrue(service.isInStock(10, 5));
  }

  @Test
  void rejectsInsufficientInventory() {
    assertFalse(service.isInStock(3, 5));
  }

  @Test
  void rejectsZeroQuantity() {
    assertFalse(service.isInStock(10, 0));
  }
}
