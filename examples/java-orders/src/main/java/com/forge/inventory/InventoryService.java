package com.forge.inventory;

public class InventoryService {
    public boolean isInStock(int available, int requested) {
        return requested > 0 && available >= requested;
    }
}