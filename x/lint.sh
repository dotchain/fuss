#!/bin/bash

gometalinter ./... --disable=vet --skip=testdata --disable=gotypex --disable=vetshadow --cyclo-over=20
