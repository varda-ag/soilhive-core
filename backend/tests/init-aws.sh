#!/bin/sh

awslocal s3api create-bucket --bucket 'varda-local-euc1-soilhive' --create-bucket-configuration LocationConstraint=eu-central-1

awslocal s3 cp /app-data/assets/ s3://varda-local-euc1-soilhive/Original_Data/ --recursive
