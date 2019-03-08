#!/bin/bash

gometalinter ./... --disable=vet --skip=data --disable=gotypex --disable=vetshadow --cyclo-over=20
