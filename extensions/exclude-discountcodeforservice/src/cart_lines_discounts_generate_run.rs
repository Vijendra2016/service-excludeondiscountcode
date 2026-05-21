use super::schema;
use schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise;
use shopify_function::prelude::*;
use shopify_function::Result;

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let has_order_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Order);
    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);

    if !has_order_discount_class && !has_product_discount_class {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let lines = input.cart().lines();

    // Collect IDs of service lines (tagged "service") to exclude from order discount
    let service_line_ids: Vec<_> = lines
        .iter()
        .filter(|line| {
            if let Merchandise::ProductVariant(v) = line.merchandise()
            {
                *v.product().has_any_tag()
            } else {
                false
            }
        })
        .map(|line| line.id().clone())
        .collect();

    let max_cart_line = lines
        .iter()
        .max_by(|a, b| {
            a.cost()
                .subtotal_amount()
                .amount()
                .partial_cmp(b.cost().subtotal_amount().amount())
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .ok_or("No cart lines found")?;

    let mut operations = vec![];

    if has_order_discount_class {
        operations.push(schema::CartOperation::OrderDiscountsAdd(
            schema::OrderDiscountsAddOperation {
                selection_strategy: schema::OrderDiscountSelectionStrategy::First,
                candidates: vec![schema::OrderDiscountCandidate {
                    targets: vec![schema::OrderDiscountCandidateTarget::OrderSubtotal(
                        schema::OrderSubtotalTarget {
                            excluded_cart_line_ids: service_line_ids,
                        },
                    )],
                    message: Some("10% OFF ORDER".to_string()),
                    value: schema::OrderDiscountCandidateValue::Percentage(schema::Percentage {
                        value: Decimal(10.0),
                    }),
                    conditions: None,
                    associated_discount_code: None,
                }],
            },
        ));
    }

    if has_product_discount_class {
        operations.push(schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::First,
                candidates: vec![schema::ProductDiscountCandidate {
                    targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                        schema::CartLineTarget {
                            id: max_cart_line.id().clone(),
                            quantity: None,
                        },
                    )],
                    message: Some("20% OFF PRODUCT".to_string()),
                    value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                        value: Decimal(20.0),
                    }),
                    associated_discount_code: None,
                    prerequisites: None,
                }],
            },
        ));
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult { operations })
}
